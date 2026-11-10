import type { StringKey } from "../i18n";

export class ApiError extends Error {
  signals?: string[];
  constructor(public code: string, signals?: string[]) {
    super(code);
    this.signals = signals;
  }
}

export function errorKey(error: unknown): StringKey {
  const code = error instanceof ApiError ? error.code : "";
  if (code === "over_budget") return "overBudget";
  if (code === "too_many_requests") return "tooMany";
  if (code === "name_latin") return "needName";
  if (code === "no_text") return "noText";
  return "genericError";
}

async function ensureOk(res: Response) {
  if (res.ok) return res;
  const body = await res.json().catch(() => ({}));
  throw new ApiError(body.error ?? "service_error", body.signals);
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await ensureOk(res)).json();
}

export async function postRaw(url: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  return ensureOk(res);
}

export async function postForm<T>(url: string, form: FormData): Promise<T> {
  return (await ensureOk(await fetch(url, { method: "POST", body: form }))).json();
}

export async function transcribe(audio: Blob, lang: string) {
  const form = new FormData();
  form.set("file", audio, "speech");
  form.set("lang", lang);
  const { text } = await postForm<{ text: string }>("/api/stt", form);
  return text.trim();
}
