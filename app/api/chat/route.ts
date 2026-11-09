import { z } from "zod";
import { readyForPlan } from "@/lib/server/counsel";
import { chatStream } from "@/lib/server/llm";
import { counsellorPrompt, type CounselStage } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema, profileSchema } from "@/lib/types";

const schema = z.object({
  lang: langSchema,
  profile: profileSchema,
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(60),
  hasPlan: z.boolean().default(false),
});

const MIN_ANSWERS_FOR_PLAN = 3;

export const POST = jsonRoute("chat", schema, async ({ lang, profile, messages, hasPlan }, req) => {
  const recent = messages.slice(-16);
  let stage: CounselStage = hasPlan ? "has_plan" : "gather";
  if (!hasPlan && messages.filter((message) => message.role === "user").length >= MIN_ANSWERS_FOR_PLAN) {
    const transcript = recent.map((message) => `${message.role === "user" ? "Person" : "Daari"}: ${message.content}`).join("\n");
    // A failed check only means the plan waits for the next answer.
    if (await readyForPlan(profile, transcript).catch(() => false)) stage = "wrap_up";
  }
  const stream = await chatStream("counsel", [{ role: "system", content: counsellorPrompt(lang, profile, stage) }, ...recent], req.signal);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      // Tells the page to make the plan while the reply is still arriving.
      "X-Daari-Plan": stage === "wrap_up" ? "make" : "no",
    },
  });
});
