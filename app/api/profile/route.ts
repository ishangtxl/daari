import { z } from "zod";
import { chatJson } from "@/lib/server/llm";
import { EXTRACT_PROMPT } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { profileSchema } from "@/lib/types";

const schema = z.object({ words: z.string().min(1).max(12000) });
const extracted = profileSchema.omit({ words: true, confirmed: true });

export const POST = jsonRoute("profile", schema, async ({ words }) => {
  const profile = await chatJson("extract", extracted, [
    { role: "system", content: EXTRACT_PROMPT },
    { role: "user", content: words },
  ]);
  return { profile };
});
