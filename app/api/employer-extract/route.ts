import { z } from "zod";
import { chatJson } from "@/lib/server/llm";
import { jsonRoute } from "@/lib/server/route";
import { langSchema } from "@/lib/types";

const EXTRACT_EMPLOYER_PROMPT = `Extract job posting details from an employer's own words. Return JSON with these keys:
- businessName: string, the shop or business name, or "" if not said
- roleCategory: string, the kind of worker needed in English (e.g. "mobile repair", "electrician", "tailor"), or ""
- locality: string, area in Bengaluru where the shop is, in English, or ""
- landmark: string, specific address or landmark, or ""
- salaryMin: number, minimum monthly salary in INR, or 0 if not said
- salaryMax: number, maximum monthly salary in INR, or 0 if not said
- vacancies: number, number of open positions, or 1 if not said
- requirements: array of strings, skills or requirements mentioned
- customNotes: string, any other job details mentioned, or ""
- whatsappContact: string, WhatsApp or mobile number, or ""
Never invent or assume anything they did not say. Output JSON only.`;

const draftSchema = z.object({
  businessName: z.string().default(""),
  roleCategory: z.string().default(""),
  locality: z.string().default(""),
  landmark: z.string().default(""),
  salaryMin: z.number().default(0),
  salaryMax: z.number().default(0),
  vacancies: z.number().default(1),
  requirements: z.array(z.string()).default([]),
  customNotes: z.string().default(""),
  whatsappContact: z.string().default(""),
});

const schema = z.object({
  lang: langSchema,
  words: z.string().max(12000),
});

export const POST = jsonRoute("employer-extract", schema, async ({ words }) => {
  const result = await chatJson(
    "employer-extract",
    draftSchema,
    [
      { role: "system", content: EXTRACT_EMPLOYER_PROMPT },
      { role: "user", content: words },
    ],
  );
  return Response.json({ draft: result });
});
