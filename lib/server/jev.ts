const URL = "https://api.typesafe.ai/v1/systemone";

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> };

type Answers = Record<string, { noul?: number; choice?: string; probabilities?: Record<string, number>; confidence?: number }>;

export async function decide(state: string, questions: Record<string, Question>): Promise<Answers> {
  const key = process.env.JEV_API_KEY;
  if (!key) throw new Error("JEV_API_KEY is not set");
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
    });
    if (res.ok) return (await res.json()).answers;
    lastStatus = res.status;
    if (res.status !== 429 && res.status !== 529) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(`Jev HTTP ${lastStatus}`);
}

/** Yes/no scores for a set of statements about the same text. */
export async function nouls<K extends string>(state: string, statements: Record<K, string | Extract<Question, { type: "noul" }>>) {
  const questions = Object.fromEntries(
    Object.entries(statements).map(([id, value]) => [
      id,
      typeof value === "string" ? { type: "noul", instructions: value } : value,
    ]),
  ) as Record<string, Question>;
  const answers = await decide(state, questions);
  return Object.fromEntries(Object.keys(statements).map((id) => [id, answers[id]?.noul ?? 0])) as Record<K, number>;
}

// Specific warnings only. A general "is this a scam?" score flagged ordinary real listings when
// tested, while these signals stayed quiet on them, so the general score is deliberately not used.
export const SCAM_SIGNALS = {
  asks_payment: "The message requires the applicant to pay money, such as a fee, deposit or charge, to get the job or an interview.",
  asks_sensitive: "The message asks for an OTP, bank details, or Aadhaar or PAN before any interview has happened.",
  unrealistic: "The pay or promises are unrealistic for the work and qualifications described.",
  pressure: "The message pressures the person to act immediately or moves them to WhatsApp or Telegram instead of a real company process.",
  no_interview: "The message says the person is selected or guaranteed the job without any interview or checking of skills.",
} as const;

export type ScamSignal = keyof typeof SCAM_SIGNALS;
export const scamSignals = (text: string) => nouls<ScamSignal>(text, SCAM_SIGNALS);
