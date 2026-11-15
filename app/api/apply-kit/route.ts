import { z } from "zod";
import { chatJson, looseList, looseText } from "@/lib/server/llm";
import { evidence, jobById } from "@/lib/server/match";
import { applyKitPrompt } from "@/lib/server/prompts";
import { fail, jsonRoute } from "@/lib/server/route";
import { langSchema, profileSchema } from "@/lib/types";

const schema = z.object({ lang: langSchema, jobId: z.string().max(40), profile: profileSchema });

const kitSchema = z.object({
  message_en: looseText,
  message_local: looseText,
  call_script: looseText,
  documents: looseList,
  questions: z.array(z.object({ question: looseText, tip: looseText })).default([]),
});

export const POST = jsonRoute("apply-kit", schema, async ({ lang, jobId, profile }) => {
  const job = jobById(jobId);
  if (!job) return fail("not_found", 404);
  const kit = await chatJson("apply-kit", kitSchema, [
    { role: "system", content: applyKitPrompt(lang) },
    { role: "user", content: `Job: ${job.title.en} at ${job.employer}\n${job.description.slice(0, 1500)}\n\nThe person's own words:\n${evidence(profile)}` },
  ], { maxTokens: 4000 });
  return { kit };
}, 15);
