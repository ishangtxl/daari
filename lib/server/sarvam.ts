import type { Lang } from "../types";

const BASE = "https://api.sarvam.ai";
const LANGUAGE_CODE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", kn: "kn-IN" };

function headers() {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error("SARVAM_API_KEY is not set");
  return { "api-subscription-key": key };
}

export async function speechToText(audio: Blob, lang: Lang): Promise<string> {
  const form = new FormData();
  // Browsers label recordings like "audio/webm;codecs=opus", and Sarvam only accepts the bare type.
  form.set("file", new Blob([audio], { type: audio.type.split(";")[0] }), "speech");
  // Codemix keeps words like "mobile repair" in English, which helps resumes and job matching.
  form.set("model", "saaras:v3");
  form.set("mode", "codemix");
  form.set("language_code", LANGUAGE_CODE[lang]);
  const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: headers(), body: form });
  if (!res.ok) throw new Error(`STT HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).transcript ?? "";
}

// Generated speech is repeated often, such as fixed prompts and replayed job details.
const speechCache = new Map<string, Buffer>();
const CACHE_LIMIT = 200;

export async function textToSpeech(text: string, lang: Lang): Promise<Buffer> {
  const key = `${lang}:${text}`;
  const cached = speechCache.get(key);
  if (cached) return cached;
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text.slice(0, 2500),
      language_code: LANGUAGE_CODE[lang],
      model: "bulbul:v3",
      speaker: "kavya",
      output_audio_codec: "mp3",
    }),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const audio = Buffer.from((await res.json()).audios[0], "base64");
  if (speechCache.size >= CACHE_LIMIT) speechCache.delete(speechCache.keys().next().value as string);
  speechCache.set(key, audio);
  return audio;
}
