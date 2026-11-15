import { appendFileSync } from "node:fs";
import { z } from "zod";

const BOB_BASE = process.env.IBM_BOB_BASE_URL ?? "https://api.us-east.bob.ibm.com/inference/v1";
const ZENMUX_BASE = process.env.ZENMUX_BASE_URL ?? "https://zenmux.ai/api/v1";

export type Role = "chat" | "work" | "resume";
type Provider = { name: "bob" | "zenmux"; url: string; headers: Record<string, string>; model: (role: Role) => string };

/**
 * IBM Bob first when IBM_BOB_API_KEY is set, then GPT-6 Luna through ZenMux if Bob fails.
 * Each provider names its own models, so a fallback never sends a Bob model name to ZenMux.
 */
function providers(): Provider[] {
  const list: Provider[] = [];
  const bobKey = process.env.IBM_BOB_API_KEY || process.env.BOB_API_KEY;
  if (bobKey && Date.now() >= bobRestingUntil) {
    const headers: Record<string, string> = {
      Authorization: `Apikey ${bobKey}`,
      "User-Agent": process.env.IBM_BOB_USER_AGENT ?? "pi-bob/0.2.2",
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (process.env.IBM_BOB_INSTANCE_ID) headers["x-instance-id"] = process.env.IBM_BOB_INSTANCE_ID;
    if (process.env.IBM_BOB_TEAM_ID) headers["x-team-id"] = process.env.IBM_BOB_TEAM_ID;
    list.push({ name: "bob", url: `${BOB_BASE}/chat/completions`, headers, model: () => process.env.BOB_MODEL ?? "premium" });
  }
  const zenKey = process.env.ZENMUX_API_KEY;
  if (zenKey) {
    list.push({
      name: "zenmux",
      url: `${ZENMUX_BASE}/chat/completions`,
      headers: { Authorization: `Bearer ${zenKey}`, "Content-Type": "application/json" },
      model: (role) =>
        role === "chat" ? (process.env.MODEL_CHAT ?? "openai/gpt-6-luna")
        : role === "resume" ? (process.env.MODEL_RESUME ?? "openai/gpt-6.1-terra")
        : (process.env.MODEL_WORK ?? "openai/gpt-6-luna"),
    });
  }
  if (list.length === 0) throw new Error("Neither IBM_BOB_API_KEY nor ZENMUX_API_KEY is set");
  return list;
}

// After Bob fails, skip it for a minute, so people are not kept waiting on it request after request.
const BOB_REST_MS = 60_000;
let bobRestingUntil = 0;
function failed(provider: Provider, error: unknown) {
  console.error(`[llm] ${provider.name} failed${provider.name === "bob" ? ", using ZenMux" : ""}:`, String(error).slice(0, 300));
  if (provider.name === "bob") bobRestingUntil = Date.now() + BOB_REST_MS;
}

/** For tests: forget that Bob failed. */
export function resetProviders() {
  bobRestingUntil = 0;
}

// Dollars per million tokens (input, output) at listed rates.
const PRICES: Record<string, [number, number]> = {
  "openai/gpt-6-luna": [0.1, 0.5],
  "openai/gpt-6.1-terra": [1, 5],
  premium: [1, 1], // IBM Bob premium: flat 2 Bobcoins/M tokens @ $0.50/coin = $1.00/M
  fast: [0.42, 0.42], // IBM Bob fast: 5/6 Bobcoins/M tokens = ~$0.42/M
};

// About Rs 1,000. Counts this process only, so it is a safety net and not an account balance.
const SPEND_LIMIT = Number(process.env.SPEND_LIMIT_USD ?? 11);
let spent = 0;

export class BudgetError extends Error {}

// How long to wait for a provider to start replying before trying the next one.
const JSON_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 45_000);
// A cap, not a cost: Bob spends about one token per character of Kannada, so caps sized for
// English cut Kannada replies off.
const DEFAULT_MAX_TOKENS = 3000;
const STREAM_TIMEOUT_MS = Number(process.env.LLM_STREAM_TIMEOUT_MS ?? 15_000);

/** Text that a model sometimes returns as a list of lines. */
export const looseText = z.preprocess((value) => (Array.isArray(value) ? value.join(" ") : value), z.string());
/** A list that a model sometimes returns as one string. */
export const looseList = z.preprocess((value) => (typeof value === "string" ? [value] : value), z.array(z.string())).default([]);

type Message = { role: "system" | "user" | "assistant"; content: string };
type Usage = { prompt_tokens?: number; completion_tokens?: number };

function record(task: string, provider: string, model: string, usage: Usage | undefined) {
  const [input, output] = PRICES[model] ?? [1, 5];
  const cost = ((usage?.prompt_tokens ?? 0) * input + (usage?.completion_tokens ?? 0) * output) / 1e6;
  spent += cost;
  const line = JSON.stringify({ at: new Date().toISOString(), task, provider, model, ...usage, cost });
  try {
    appendFileSync(".spend.jsonl", line + "\n");
  } catch {
    console.log(line); // Read-only filesystems, such as serverless hosts.
  }
}

function assertBudget() {
  if (spent >= SPEND_LIMIT) throw new BudgetError(`Spend limit of $${SPEND_LIMIT} reached`);
}

/**
 * POST to one provider. The timeout covers waiting for the reply to start, not reading a stream,
 * so a slow provider is given up on without cutting off a reply that is already arriving.
 */
async function post(provider: Provider, body: object, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(new Error(`no reply in ${timeoutMs} ms`)), timeoutMs);
  try {
    return await fetch(provider.url, {
      method: "POST",
      headers: provider.headers,
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timer.signal]) : timer.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Models sometimes write a sentence or code fence around the JSON, so read just the outer object. */
export function parseJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SyntaxError("No JSON object in reply");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Ask for JSON matching a schema. Each provider gets two tries, for a server error or an unusable
 * reply, and then the next provider gets the same request.
 */
export async function chatJson<S extends z.ZodType>(
  task: string,
  schema: S,
  messages: Message[],
  options: { role?: Role; maxTokens?: number } = {},
): Promise<z.output<S>> {
  assertBudget();
  let lastError: unknown;
  for (const provider of providers()) {
    const model = provider.model(options.role ?? "work");
    let providerError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await post(provider, {
          model,
          messages,
          temperature: 0.2,
          max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
          reasoning_effort: "none",
          response_format: { type: "json_object" },
        }, JSON_TIMEOUT_MS);
      } catch (error) {
        providerError = error; // A timeout or network failure: move to the next provider.
        break;
      }
      if (!res.ok) {
        providerError = new Error(`${provider.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        if (res.status < 500 && res.status !== 429) break;
        continue;
      }
      try {
        const payload = await res.json();
        record(task, provider.name, model, payload.usage);
        // A reply cut off at the token limit would be cut off again, so go straight to the next provider.
        if (payload.choices?.[0]?.finish_reason === "length") {
          providerError = new Error(`${provider.name} reply was cut off at ${options.maxTokens ?? DEFAULT_MAX_TOKENS} tokens`);
          break;
        }
        return schema.parse(parseJson(payload.choices?.[0]?.message?.content ?? ""));
      } catch (error) {
        providerError = error;
      }
    }
    failed(provider, providerError);
    lastError = providerError;
  }
  throw lastError;
}

/** Stream a reply as plain text chunks. */
export async function chatStream(task: string, messages: Message[], signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  assertBudget();
  // Fall back only before any text arrives. Once a reply is streaming, switching would repeat it.
  let res: Response | null = null;
  let provider: Provider | null = null;
  let model = "";
  let lastError: unknown;
  for (const candidate of providers()) {
    model = candidate.model("chat");
    try {
      const reply = await post(candidate, {
        model,
        messages,
        temperature: 0.4,
        max_tokens: 600,
        reasoning_effort: "none",
        stream: true,
        stream_options: { include_usage: true },
      }, STREAM_TIMEOUT_MS, signal);
      if (reply.ok && reply.body) {
        res = reply;
        provider = candidate;
        break;
      }
      lastError = new Error(`${candidate.name} HTTP ${reply.status}: ${(await reply.text()).slice(0, 200)}`);
    } catch (error) {
      if (signal?.aborted) throw error; // The person left, so there is no one to fall back for.
      lastError = error;
    }
    failed(candidate, lastError);
  }
  if (!res?.body || !provider) throw lastError;
  const served = provider.name;

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
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:") || trimmed.includes("[DONE]")) continue;
          try {
            const data = JSON.parse(trimmed.slice(5).trim());
            if (data.usage) record(task, served, model, data.usage);
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
