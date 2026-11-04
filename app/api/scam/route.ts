import { z } from "zod";
import { scamSignals, type ScamSignal } from "@/lib/server/jev";
import { chatJson, looseText } from "@/lib/server/llm";
import { scamExplainPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema } from "@/lib/types";

const schema = z.object({ lang: langSchema, text: z.string().min(5).max(6000) });
const WARN_AT = 0.6;

export const POST = jsonRoute("scam", schema, async ({ lang, text }) => {
  const scores = await scamSignals(text);
  const warnings = (Object.keys(scores) as ScamSignal[]).filter((signal) => scores[signal] >= WARN_AT);
  let advice: string | null = null;
  if (warnings.length) {
    try {
      const reply = await chatJson("scam-explain", z.object({ advice: looseText }), [
        { role: "system", content: `${scamExplainPrompt(lang)}${warnings.join(", ")}. Return JSON {"advice": "..."}.` },
        { role: "user", content: text },
      ]);
      advice = reply.advice;
    } catch (error) {
      // The warnings themselves are what matter, so still show them if the explanation fails.
      console.error("[scam-explain]", error);
    }
  }
  return { warnings, scores, advice };
}, 20);
