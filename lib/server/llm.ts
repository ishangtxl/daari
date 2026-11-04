import { appendFileSync } from "node:fs";
import { z } from "zod";

const BASE = "https://zenmux.ai/api/v1";

// Luna is the default on measured cost and quality. Terra is reserved for the final resume text.
export const MODELS = {
  chat: process.env.MODEL_CHAT ?? "openai/gpt-6-luna",
  work: process.env.MODEL_WORK ?? "openai/gpt-6-luna",
  resume: process.env.MODEL_RESUME ?? "openai/gpt-6.1-terra",
};

// Dollars per million tokens (input, output) at ZenMux's listed short-prompt rates.
const PRICES: Record<string, [number, number]> = {
  "openai/gpt-6-luna": [0.1, 0.5],
  "openai/gpt-6.1-terra": [1, 5],
};

// About Rs 1,000. Counts this process only, so it is a safety net and not an account balance.
const SPEND_LIMIT = Number(process.env.SPEND_LIMIT_USD ?? 11);
let spent = 0;

export class BudgetError extends Error {}

/** Text that a model sometimes returns as a list of lines. */
export const looseText = z.preprocess((value) => (Array.isArray(value) ? value.join(" ") : value), z.string());
/** A list that a model sometimes returns as one string. */
export const looseList = z.preprocess((value) => (typeof value === "string" ? [value] : value), z.array(z.string())).default([]);

type Message = { role: "system" | "user" | "assistant"; content: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number };

function record(task: string, model: string, usage: Usage | undefined) {
  const [input, output] = PRICES[model] ?? [1, 5];
  const cost = ((usage?.prompt_tokens ?? 0) * input + (usage?.completion_tokens ?? 0) * output) / 1e6;
  spent += cost;
  const line = JSON.stringify({ at: new Date().toISOString(), task, model, ...usage, cost });
  try {
    appendFileSync(".spend.jsonl", line + "\n");
  } catch {
    console.log(line); // Read-only filesystems, such as serverless hosts.
  }
}

function assertBudget() {
  if (spent >= SPEND_LIMIT) throw new BudgetError(`Spend limit of $${SPEND_LIMIT} reached`);
}

async function call(body: object, signal?: AbortSignal) {
  const key = process.env.ZENMUX_API_KEY;
  if (!key) throw new Error("ZENMUX_API_KEY is not set");
  return fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/** Models sometimes write a sentence or code fence around the JSON, so read just the outer object. */
export function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

/** Ask for JSON matching a schema, retrying once when the model returns something unusable. */
export async function chatJson<S extends z.ZodType>(
  task: string,
  schema: S,
  messages: Message[],
  options: { model?: string; maxTokens?: number } = {},
): Promise<z.output<S>> {
  assertBudget();
  const model = options.model ?? MODELS.work;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await call({
      model,
      messages,
      temperature: 0.2,
      max_tokens: options.maxTokens ?? 1500,
      reasoning_effort: "none",
      response_format: { type: "json_object" },
    });
    if (!res.ok) {
      lastError = new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      if (res.status < 500 && res.status !== 429) break;
      continue;
    }
    const payload = await res.json();
    record(task, model, payload.usage);
    try {
      return schema.parse(parseJson(payload.choices?.[0]?.message?.content ?? ""));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Stream a reply as plain text chunks. */
export async function chatStream(task: string, messages: Message[], signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  assertBudget();
  const model = MODELS.chat;
  const res = await call(
    {
      model,
      messages,
      temperature: 0.4,
      max_tokens: 300,
      reasoning_effort: "none",
      stream: true,
      stream_options: { include_usage: true },
    },
    signal,
  );
  if (!res.ok || !res.body) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
          try {
            const data = JSON.parse(line.slice(5));
            if (data.usage) record(task, model, data.usage);
            const text = data.choices?.[0]?.delta?.content;
            if (text) controller.enqueue(encoder.encode(text));
          } catch {
            // A keep-alive or partial frame, which is safe to skip.
          }
        }
      },
    }),
  );
}
