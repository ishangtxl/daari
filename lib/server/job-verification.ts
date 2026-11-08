import { z } from "zod";
import { scamSignals } from "./jev";
import { chatJson, MODELS } from "./llm";
import type { BusinessProofType, BusinessVerification, FullJob, Requirement } from "../types";

// ── 1. Business Proof Validation ──────────────────────────────────────────────

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const UDYAM_REGEX = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/i;
const MERCHANT_UPI_REGEX = /^[\w.-]+@(paytm|phonepe|icici|ybl|axl|okhdfcbank|okaxis|okicici|oksbi|bharatpe|freecharge|airtel|ibl|yesbank)$/i;

export function validateBusinessProof(
  proofType: BusinessProofType,
  proofValue?: string,
): { valid: boolean; reason?: string } {
  if (proofType === "none" || proofType === "storefront") {
    return { valid: true };
  }
  const clean = (proofValue ?? "").trim();
  if (!clean) {
    return { valid: false, reason: "Verification ID / handle is required for this verification type." };
  }

  if (proofType === "gstin") {
    const upper = clean.toUpperCase();
    if (!GSTIN_REGEX.test(upper)) {
      return { valid: false, reason: "Invalid GSTIN format. Expected 15 characters (e.g. 29AAAAA0000A1Z5)." };
    }
    return { valid: true };
  }

  if (proofType === "udyam") {
    if (!UDYAM_REGEX.test(clean)) {
      return { valid: false, reason: "Invalid Udyam Registration number format (e.g. UDYAM-KR-03-0123456)." };
    }
    return { valid: true };
  }

  if (proofType === "merchant_upi") {
    if (!MERCHANT_UPI_REGEX.test(clean)) {
      return { valid: false, reason: "Please enter a valid Merchant UPI VPA (e.g. shopname@paytm or shopname@phonepe)." };
    }
    return { valid: true };
  }

  return { valid: true };
}

// ── 2. Fraud & Scam Screening (TypeSafe Jev) ──────────────────────────────────

const SCAM_KEYWORDS = [
  "registration fee",
  "uniform charge",
  "uniform fee",
  "processing fee",
  "training fee",
  "security deposit",
  "pay advance",
  "joining fee",
  "kit charge",
  "ಡೆಪಾಸಿಟ್",
  "ಶುಲ್ಕ",
  "ನೋಂದಣಿ ಶುಲ್ಕ",
  "फीस",
  "रजिस्ट्रेशन शुल्क",
  "जमा राशि",
];

export async function screenJobScam(text: string): Promise<{
  isScam: boolean;
  reason?: string;
  signals: { asks_payment: number; asks_sensitive: number; unrealistic: number };
}> {
  const lower = text.toLowerCase();
  for (const kw of SCAM_KEYWORDS) {
    if (lower.includes(kw)) {
      return {
        isScam: true,
        reason: `Demanding payment or fees (${kw}) is strictly prohibited on Daari.`,
        signals: { asks_payment: 1.0, asks_sensitive: 0.1, unrealistic: 0.3 },
      };
    }
  }

  try {
    const scores = await scamSignals(text);
    const asks_payment = scores.asks_payment ?? 0;
    const asks_sensitive = scores.asks_sensitive ?? 0;
    const unrealistic = scores.unrealistic ?? 0;

    if (asks_payment >= 0.4) {
      return {
        isScam: true,
        reason: "Our trust engine detected potential requests for candidate fees or deposits.",
        signals: { asks_payment, asks_sensitive, unrealistic },
      };
    }

    if (asks_sensitive >= 0.5) {
      return {
        isScam: true,
        reason: "Our trust engine flagged requests for sensitive personal information.",
        signals: { asks_payment, asks_sensitive, unrealistic },
      };
    }

    return {
      isScam: false,
      signals: { asks_payment, asks_sensitive, unrealistic },
    };
  } catch (err) {
    console.warn("[job-verification] Jev API unreachable, relying on heuristic keyword scan:", err);
    return {
      isScam: false,
      signals: { asks_payment: 0.05, asks_sensitive: 0.05, unrealistic: 0.05 },
    };
  }
}

// ── 3. AI Multilingual Enrichment & Stop Extraction (IBM Bob) ─────────────────

const AIEnrichmentSchema = z.object({
  title: z.object({
    en: z.string(),
    hi: z.string(),
    kn: z.string(),
  }),
  summary: z.object({
    en: z.string(),
    hi: z.string(),
    kn: z.string(),
  }),
  requirements: z.array(
    z.object({
      id: z.string(),
      en: z.string(),
      hi: z.string(),
      kn: z.string(),
      kind: z.enum(["skill", "license", "tool", "education"]),
    }),
  ),
});

export type JobPostInput = {
  businessName: string;
  roleCategory: string;
  locality: string;
  landmark: string;
  salaryMin: number;
  salaryMax: number;
  selectedRequirements: string[];
  customNotes?: string;
  whatsappContact: string;
  verification: {
    proofType: BusinessProofType;
    proofValue?: string;
  };
};

export async function enrichJobWithAI(input: JobPostInput): Promise<{
  title: { en: string; hi: string; kn: string };
  summary: { en: string; hi: string; kn: string };
  requirements: Requirement[];
}> {
  const prompt = `You are Daari's multilingual job structuring engine for Bengaluru trade & vocational workers.
Given the following direct employer posting, format the job title, a 1-sentence localized summary, and 3-5 concrete requirement stops.
Output strictly in JSON matching the schema. All string values must be on a single line with no embedded newlines.

Business Name: ${input.businessName}
Role Category: ${input.roleCategory}
Bengaluru Locality: ${input.locality}
Landmark / Shop Address: ${input.landmark}
Monthly Pay: ₹${input.salaryMin} - ₹${input.salaryMax}
Selected Requirements: ${input.selectedRequirements.join(", ")}
Custom Notes: ${input.customNotes || "None"}

Requirements MUST be realistic trade stops in Kannada, Hindi, and English (e.g. "Can repair smartphone display", "Owns two-wheeler with DL", "Basic Kannada conversation").`;

  try {
    const result = await chatJson(
      "enrich-job-posting",
      AIEnrichmentSchema,
      [
        { role: "system", content: "You output valid JSON for Daari's job posting catalog." },
        { role: "user", content: prompt },
      ],
      { model: MODELS.work, maxTokens: 900 },
    );
    return result;
  } catch (err) {
    console.warn("[job-verification] AI enrichment failed, using deterministic trade fallback:", err);
    return getDeterministicEnrichment(input);
  }
}

function getDeterministicEnrichment(input: JobPostInput): {
  title: { en: string; hi: string; kn: string };
  summary: { en: string; hi: string; kn: string };
  requirements: Requirement[];
} {
  const roleName = input.roleCategory || "Skilled Technician";
  const loc = input.locality || "Bengaluru";

  const reqs: Requirement[] = input.selectedRequirements.map((req, idx) => ({
    id: `req_${idx + 1}`,
    en: req,
    hi: req,
    kn: req,
    kind: req.toLowerCase().includes("two-wheeler") ? "license" : "skill",
  }));

  if (reqs.length === 0) {
    reqs.push(
      {
        id: "req_trade",
        en: `Hands-on practical experience in ${roleName}`,
        hi: `${roleName} में व्यावहारिक अनुभव`,
        kn: `${roleName} ಕೆಲಸದಲ್ಲಿ ಪ್ರಾಯೋಗಿಕ ಅನುಭವ`,
        kind: "skill",
      },
      {
        id: "req_lang",
        en: "Basic Kannada or Hindi communication with shop customers",
        hi: "ग्राहकों से बुनियादी कन्नड़ या हिंदी में बातचीत",
        kn: "ಗ್ರಾಹಕರೊಂದಿಗೆ ವ್ಯವಹರಿಸಲು ಮೂಲಭೂತ ಕನ್ನಡ ಅಥವಾ ಹಿಂದಿ",
        kind: "skill",
      },
    );
  }

  return {
    title: {
      en: `${roleName} at ${input.businessName}`,
      hi: `${input.businessName} में ${roleName}`,
      kn: `${input.businessName} ನಲ್ಲಿ ${roleName}`,
    },
    summary: {
      en: `Immediate vacancy for ${roleName} at ${input.businessName} in ${loc}. Monthly salary ₹${input.salaryMin} - ₹${input.salaryMax}.`,
      hi: `${loc} में ${input.businessName} पर ${roleName} की सीधी भर्ती। मासिक वेतन ₹${input.salaryMin} - ₹${input.salaryMax}।`,
      kn: `${loc} ನ ${input.businessName} ನಲ್ಲಿ ${roleName} ಹುದ್ದೆಗೆ ನೇರ ನೇಮಕಾತಿ. ಮಾಸಿಕ ವೇತನ ₹${input.salaryMin} - ₹${input.salaryMax}.`,
    },
    requirements: reqs,
  };
}
