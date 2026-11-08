import { z } from "zod";
import { chatStream } from "@/lib/server/llm";
import { employerPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema } from "@/lib/types";

const draftSchema = z.object({
  businessName: z.string().default(""),
  roleCategory: z.string().default(""),
  customRoleName: z.string().default(""),
  locality: z.string().default(""),
  landmark: z.string().default(""),
  salaryMin: z.number().default(16000),
  salaryMax: z.number().default(22000),
  vacancies: z.number().default(1),
  requirements: z.array(z.string()).default([]),
  customNotes: z.string().default(""),
  whatsappContact: z.string().default(""),
  proofType: z.string().default("merchant_upi"),
  proofValue: z.string().default(""),
});

const schema = z.object({
  lang: langSchema,
  draft: draftSchema,
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(60),
});

export const POST = jsonRoute("employer-chat", schema, async ({ lang, draft, messages }, req) => {
  const stream = await chatStream(
    "counsel",
    [{ role: "system", content: employerPrompt(lang, draft) }, ...messages.slice(-16)],
    req.signal,
  );
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
