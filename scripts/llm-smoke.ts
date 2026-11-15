/**
 * Sends one JSON request and one streamed reply through the language model, and prints which
 * provider answered (IBM Bob first, ZenMux if Bob fails) and how long each took.
 *   npx tsx --env-file=.env scripts/llm-smoke.ts
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { chatJson, chatStream } from "../lib/server/llm";

const lastProvider = () => JSON.parse(readFileSync(".spend.jsonl", "utf8").trim().split("\n").at(-1)!).provider;

async function main() {
  let start = Date.now();
  const json = await chatJson("smoke", z.object({ answer: z.string() }), [
    { role: "user", content: 'Reply with only this JSON: {"answer": "ok"}' },
  ]);
  console.log(`json: ${JSON.stringify(json)} from ${lastProvider()} in ${Date.now() - start} ms`);

  start = Date.now();
  const text = await new Response(await chatStream("smoke", [
    { role: "user", content: "Say hello in Kannada, in one short sentence." },
  ])).text();
  console.log(`stream: ${text.trim()} from ${lastProvider()} in ${Date.now() - start} ms`);
}

main();
