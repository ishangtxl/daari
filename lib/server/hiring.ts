/**
 * Turning what an employer says into a posting. A language model writes the posting and its
 * translations; Jev decides the kind of work and whether the posting may go up at all.
 */

import { z } from "zod";
import { ROLES } from "../roles";
import { POSTING_SIGNAL_KEYS, type PostingBody, type PostingForm, type PostingSignal, type PostingSignals } from "../postings";
import type { Lang } from "../types";
import { decide, nouls } from "./jev";
import { chatJson, looseText } from "./llm";
import { LANGUAGE_NAME, LANGUAGE_RULE } from "./prompts";


export const POSTING_SIGNALS: Record<PostingSignal, string> = {
  asks_payment: "The job posting requires applicants to pay money, such as a registration fee, deposit, training charge, or a uniform or kit cost, to get the job or an interview.",
  asks_sensitive: "The job posting asks applicants to share an OTP, bank details, or Aadhaar or PAN before any interview.",
  discriminates: "The job posting accepts or refuses applicants because of their caste, religion or community.",
  unrealistic: "The pay or promises are unrealistic for the work and qualifications described.",
};

export async function screenPosting(text: string): Promise<PostingSignals> {
  const scores = await nouls<PostingSignal>(text, POSTING_SIGNALS);
  return Object.fromEntries(POSTING_SIGNAL_KEYS.map((key) => [key, scores[key] ?? 0])) as PostingSignals;
}

export async function pickPostingRole(text: string): Promise<string> {
  const answers = await decide(text, {
    role: {
      type: "choice",
      instructions: "Which kind of work is this job posting for?",
      criteria: Object.fromEntries(ROLES.map((role) => [role.id, role.en])),
    },
  });
  const choice = answers.role?.choice;
  return ROLES.some((role) => role.id === choice) ? choice! : ROLES[0].id;
}

const money = z.preprocess((value) => (typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) || null : value), z.number().nonnegative().nullable().catch(null)).default(null);

export const draftSchema = z.object({
  title: looseText.default(""),
  business: looseText.default(""),
  area: looseText.default(""),
  summary: looseText.default(""),
  timings: looseText.default(""),
  pay_min: money,
  pay_max: money,
  pay_period: z.enum(["month", "day"]).catch("month").default("month"),
  requirements: z.array(looseText).max(6).catch([]).default([]),
});

export function draftPrompt(lang: Lang) {
  return `An employer in Bangalore described, in their own words, a job they want to fill. Turn it into a clear job posting for workers with limited formal education. Return JSON with:
- title: the job title in plain words, at most 6 words, like "Mobile repair technician". Never put gender in it: write "helper", not "boy".
- business: the shop or company name if they said it, written in English letters so every reader can read it, otherwise "".
- area: the part of Bangalore where the work is, if they said it, otherwise "". Write it in English letters.
- summary: one or two short, simple sentences on what the worker will do each day.
- timings: the working hours and days off if they said them, like "10 am to 8 pm, Sunday off", otherwise "".
- pay_min and pay_max: the pay in rupees as numbers, if they said it, otherwise null. When they gave one figure, put it in both.
- pay_period: "day" if the pay is per day, otherwise "month".
- requirements: up to 6 things the worker must have or be able to do, only from what the employer said, most important first. Write each as a short statement, never a question, so a worker can answer yes or no to it, like "Can replace phone screens" or "Has a two-wheeler licence". Leave out what the employer called a plus or optional, vague things like "hard working", and anything about gender, caste, religion or community.
Write title, summary, timings and requirements in the employer's language. ${LANGUAGE_RULE[lang]}
Never add anything the employer did not say. Output JSON only.`;
}

export async function draftPosting(lang: Lang, words: string) {
  const [draft, roleId, signals] = await Promise.all([
    chatJson("posting-draft", draftSchema, [
      { role: "system", content: draftPrompt(lang) },
      { role: "user", content: words },
    ]),
    pickPostingRole(words),
    screenPosting(words),
  ]);
  return { draft, roleId, signals };
}

const localized = z.object({ en: looseText, hi: looseText, kn: looseText });
const KINDS = ["education", "experience", "skill", "licence", "other"] as const;
const translationSchema = z.object({
  title: localized,
  summary: localized,
  timings: localized.nullable().catch(null).default(null),
  requirements: z.array(localized.extend({ kind: z.enum(KINDS).catch("other").default("other") })).default([]),
});

export function translatePrompt(lang: Lang) {
  return `Translate this job posting for workers in Bangalore into English, Hindi and Kannada. The employer wrote it in ${LANGUAGE_NAME[lang]}. Return JSON with:
- title: {en, hi, kn}
- summary: {en, hi, kn}
- timings: {en, hi, kn}, or null when there are no timings
- requirements: one {en, hi, kn, kind} for each requirement given, in the same order. kind is one of education, experience, skill, licence or other.
hi is in Devanagari and kn in Kannada script, in the everyday words workers use. In Kannada use real Kannada words, never Hindi words. Keep work words like mobile, ITI or AC as people say them. Write each English requirement so it can be checked against what a person says, like "Can replace phone screens". Keep the meaning exactly and add nothing. Output JSON only.`;
}

/** The text Jev reads to screen a posting: everything an applicant would see. */
export function postingText(form: PostingForm) {
  return [
    `${form.title} at ${form.business}, ${form.area}.`,
    form.workType && `Kind of work: ${form.workType}`,
    form.summary,
    form.timings && `Timings: ${form.timings}`,
    (form.payMin ?? form.payMax) !== null && `Pay: ${form.payMin ?? ""}${form.payMax && form.payMax !== form.payMin ? ` to ${form.payMax}` : ""} rupees a ${form.payPeriod}`,
    form.requirements.length > 0 && `Requirements: ${form.requirements.join("; ")}`,
  ].filter(Boolean).join("\n");
}

/** The posting in all three languages, ready to store. Nothing is stored if it fails. */
export async function buildPosting(form: PostingForm, signals: PostingSignals): Promise<PostingBody> {
  const translated = await chatJson("posting-translate", translationSchema, [
    { role: "system", content: translatePrompt(form.lang) },
    { role: "user", content: JSON.stringify({ title: form.title, summary: form.summary, timings: form.timings || null, requirements: form.requirements }) },
  ], { maxTokens: 5000 });
  if (translated.requirements.length !== form.requirements.length) throw new Error("Translation changed the number of requirements");
  // The employer's own words stay exactly as typed in their language.
  const own = <T extends Record<Lang, string>>(value: T, original: string) => ({ ...value, [form.lang]: original });
  return {
    form,
    title: own(translated.title, form.title),
    summary: own(translated.summary, form.summary),
    timings: form.timings ? own(translated.timings ?? { en: form.timings, hi: form.timings, kn: form.timings }, form.timings) : null,
    requirements: translated.requirements.map((req, index) => ({
      id: `r${index}`,
      kind: req.kind,
      ...own({ en: req.en, hi: req.hi, kn: req.kn }, form.requirements[index]),
    })),
    signals,
  };
}
