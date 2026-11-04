import { z } from "zod";
import { jsonRoute } from "@/lib/server/route";
import { textToSpeech } from "@/lib/server/sarvam";
import { langSchema } from "@/lib/types";

const schema = z.object({ text: z.string().min(1).max(1200), lang: langSchema });

export const POST = jsonRoute("tts", schema, async ({ text, lang }) => {
  const audio = await textToSpeech(text, lang);
  return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}, 40);
