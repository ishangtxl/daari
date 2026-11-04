import { z } from "zod";
import { chatJson, looseText } from "@/lib/server/llm";
import { evidence } from "@/lib/server/match";
import { interviewFeedbackPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema, profileSchema } from "@/lib/types";

const schema = z.object({ lang: langSchema, question: z.string().max(500), answer: z.string().min(1).max(4000), profile: profileSchema });

export const POST = jsonRoute("interview", schema, async ({ lang, question, answer, profile }) => {
  const feedback = await chatJson("interview", z.object({ good: looseText, better: looseText }), [
    { role: "system", content: interviewFeedbackPrompt(lang) },
    { role: "user", content: `Question: ${question}\nTheir answer: ${answer}\nWhat they have told us about themselves:\n${evidence(profile)}` },
  ]);
  return { feedback };
}, 20);
