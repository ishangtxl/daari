import { z } from "zod";
import { chatStream } from "@/lib/server/llm";
import { counsellorPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema, profileSchema } from "@/lib/types";

const schema = z.object({
  lang: langSchema,
  profile: profileSchema,
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).min(1).max(60),
});

export const POST = jsonRoute("chat", schema, async ({ lang, profile, messages }, req) => {
  const stream = await chatStream(
    "counsel",
    [{ role: "system", content: counsellorPrompt(lang, profile) }, ...messages.slice(-16)],
    req.signal,
  );
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
});
