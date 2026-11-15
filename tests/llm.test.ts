import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJson, chatStream, resetProviders } from "../lib/server/llm";

const BOB = "api.us-east.bob.ibm.com";
const schema = z.object({ answer: z.string() });
const messages = [{ role: "user" as const, content: "hi" }];

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const reply = (content: string) => json({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
const stream = (text: string) =>
  new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { status: 200 });

/** Answers each request with whatever the handler returns for that provider, and records who was asked. */
function fakeFetch(handler: (provider: "bob" | "zenmux", body: { model: string }) => Response | Promise<Response>) {
  const asked: { provider: string; model: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const provider = url.includes(BOB) ? "bob" : "zenmux";
    const body = JSON.parse(String(init.body));
    asked.push({ provider, model: body.model });
    return handler(provider, body);
  }));
  return asked;
}

async function readAll(body: ReadableStream<Uint8Array>) {
  return new Response(body).text();
}

describe("language model providers", () => {
  beforeEach(() => {
    resetProviders();
    vi.stubEnv("IBM_BOB_API_KEY", "bob-key");
    vi.stubEnv("ZENMUX_API_KEY", "zen-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses IBM Bob when it answers", async () => {
    const asked = fakeFetch(() => reply('{"answer":"from bob"}'));
    expect(await chatJson("t", schema, messages)).toEqual({ answer: "from bob" });
    expect(asked).toEqual([{ provider: "bob", model: "premium" }]);
  });

  it("falls back to GPT-6 Luna on ZenMux when Bob returns an error", async () => {
    const asked = fakeFetch((provider) => (provider === "bob" ? json({ error: "bad key" }, 401) : reply('{"answer":"from luna"}')));
    expect(await chatJson("t", schema, messages)).toEqual({ answer: "from luna" });
    expect(asked).toEqual([{ provider: "bob", model: "premium" }, { provider: "zenmux", model: "openai/gpt-6-luna" }]);
  });

  it("retries Bob once on a server error, then falls back", async () => {
    const asked = fakeFetch((provider) => (provider === "bob" ? json({}, 503) : reply('{"answer":"from luna"}')));
    expect(await chatJson("t", schema, messages)).toEqual({ answer: "from luna" });
    expect(asked.map((a) => a.provider)).toEqual(["bob", "bob", "zenmux"]);
  });

  it("falls back when Bob's reply is not the JSON asked for", async () => {
    const asked = fakeFetch((provider) => (provider === "bob" ? reply("Sure! Here you go.") : reply('{"answer":"from luna"}')));
    expect(await chatJson("t", schema, messages)).toEqual({ answer: "from luna" });
    expect(asked.map((a) => a.provider)).toEqual(["bob", "bob", "zenmux"]);
  });

  it("falls back when Bob cannot be reached", async () => {
    fakeFetch((provider) => {
      if (provider === "bob") throw new TypeError("fetch failed");
      return reply('{"answer":"from luna"}');
    });
    expect(await chatJson("t", schema, messages)).toEqual({ answer: "from luna" });
  });

  it("skips Bob for a while after it fails", async () => {
    const asked = fakeFetch((provider) => (provider === "bob" ? json({}, 401) : reply('{"answer":"from luna"}')));
    await chatJson("t", schema, messages);
    await chatJson("t", schema, messages);
    expect(asked.map((a) => a.provider)).toEqual(["bob", "zenmux", "zenmux"]);
  });

  it("uses ZenMux's resume model, never Bob's model name, on fallback", async () => {
    const asked = fakeFetch((provider) => (provider === "bob" ? json({}, 400) : reply('{"answer":"resume"}')));
    await chatJson("t", schema, messages, { role: "resume" });
    expect(asked[1]).toEqual({ provider: "zenmux", model: "openai/gpt-6.1-terra" });
  });

  it("goes straight to ZenMux when Bob's reply is cut off at the token limit", async () => {
    const cut = json({ choices: [{ message: { content: '{"answer": "unfin' }, finish_reason: "length" }] });
    const asked = fakeFetch((provider) => (provider === "bob" ? cut : reply('{"answer":"from luna"}')));
    expect(await chatJson("t", schema, messages)).toEqual({ answer: "from luna" });
    expect(asked.map((a) => a.provider)).toEqual(["bob", "zenmux"]);
  });

  it("uses only ZenMux when there is no Bob key", async () => {
    vi.stubEnv("IBM_BOB_API_KEY", "");
    const asked = fakeFetch(() => reply('{"answer":"from luna"}'));
    await chatJson("t", schema, messages);
    expect(asked.map((a) => a.provider)).toEqual(["zenmux"]);
  });

  it("throws when both providers fail", async () => {
    fakeFetch(() => json({ error: "down" }, 400));
    await expect(chatJson("t", schema, messages)).rejects.toThrow(/zenmux HTTP 400/);
  });

  it("streams from Bob, and falls back to ZenMux before any text arrives", async () => {
    fakeFetch(() => stream("hello from bob"));
    expect(await readAll(await chatStream("t", messages))).toBe("hello from bob");

    resetProviders();
    const asked = fakeFetch((provider) => (provider === "bob" ? json({}, 500) : stream("hello from luna")));
    expect(await readAll(await chatStream("t", messages))).toBe("hello from luna");
    expect(asked.map((a) => a.provider)).toEqual(["bob", "zenmux"]);
  });
});
