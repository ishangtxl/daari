/**
 * Jobs that employers post on Daari itself, and the applications people send to them. The browser
 * and the server share these schemas, so a form that passes here is one the server will accept.
 */

import { z } from "zod";
import { ROLES } from "./roles";
import { langSchema, type Job, type Localized, type Requirement } from "./types";

/** Posting ids start with this, which no catalog id does, so a link can tell the two apart. */
export const POSTING_PREFIX = "post-";
export const isPostingId = (id: string) => id.startsWith(POSTING_PREFIX);

/** A posting stays up this long, then the employer renews it if they are still hiring. */
export const POSTING_DAYS = 30;
/** Open postings one account may have at a time, so one account cannot flood the job lists. */
export const MAX_OPEN_POSTINGS = 10;
/** Reports from this many different people take a posting down until it is looked at. */
export const HIDE_AFTER_REPORTS = 3;
export const MAX_REQUIREMENTS = 6;
/** Rough working days in a month, to compare day wages with monthly pay. */
const WORKING_DAYS = 26;

const text = (max: number) => z.string().trim().max(max);
const pay = z.number().int().min(0).max(1_000_000).nullable();

/** Chosen when no listed kind of work fits: the employer types it, and Jev picks the nearest one to match on. */
export const OTHER_WORK = "other";

/** What the employer fills in, in their own language. The server translates it on publishing. */
export const postingFormSchema = z
  .object({
    lang: langSchema,
    roleId: z.string().refine((id) => id === OTHER_WORK || ROLES.some((role) => role.id === id)),
    workType: text(60).default(""),
    title: text(120).min(2),
    business: text(120).min(2),
    area: text(120).min(2),
    summary: text(600).min(10),
    timings: text(200).default(""),
    payMin: pay,
    payMax: pay,
    payPeriod: z.enum(["month", "day"]),
    requirements: z.array(text(200).min(2)).max(MAX_REQUIREMENTS),
  })
  .refine((form) => form.payMin === null || form.payMax === null || form.payMax >= form.payMin, { path: ["payMax"] })
  .refine((form) => form.roleId !== OTHER_WORK || form.workType.length >= 2, { path: ["workType"] });
export type PostingForm = z.infer<typeof postingFormSchema>;

export const POSTING_SIGNAL_KEYS = ["asks_payment", "asks_sensitive", "discriminates", "unrealistic"] as const;
export type PostingSignal = (typeof POSTING_SIGNAL_KEYS)[number];
export type PostingSignals = Record<PostingSignal, number>;

/** Signals that stop a posting from going up at all. The rest are shown to people as a caution. */
export const BLOCKING_SIGNALS: PostingSignal[] = ["asks_payment", "asks_sensitive", "discriminates"];
export const BLOCK_AT = 0.6;
export const CAUTION_AT = 0.7;

export function screenVerdict(scores: PostingSignals) {
  return {
    blocked: BLOCKING_SIGNALS.filter((signal) => scores[signal] >= BLOCK_AT),
    cautions: (["unrealistic"] as const).filter((signal) => scores[signal] >= CAUTION_AT),
  };
}

/** Everything stored for a posting: the form as typed, and the translated listing made from it. */
export type PostingBody = {
  form: PostingForm;
  /** The listed kind of work job seekers are matched on. Older postings go by the form's choice. */
  matchRole?: string;
  title: Localized;
  summary: Localized;
  timings: Localized | null;
  requirements: Requirement[];
  signals: PostingSignals;
};

export type PostingState = "open" | "closed" | "expired" | "hidden";

export function payText(form: Pick<PostingForm, "payMin" | "payMax" | "payPeriod">): string | null {
  const { payMin: low, payMax: high, payPeriod } = form;
  const figure = (value: number) => value.toLocaleString("en-IN");
  const per = payPeriod === "day" ? "a day" : "a month";
  if (low !== null && high !== null && high > low) return `Rs ${figure(low)} to ${figure(high)} ${per}`;
  const one = low ?? high;
  return one !== null ? `Rs ${figure(one)} ${per}` : null;
}

/** The posting as one more job in the list, so it is matched and shown like every other. */
export function postingToJob(id: string, body: PostingBody, postedAt: string): Job {
  const { form } = body;
  const low = form.payMin ?? form.payMax;
  const description = [
    `${body.title.en} at ${form.business}, ${form.area}.`,
    body.summary.en,
    body.timings ? `Timings: ${body.timings.en}.` : "",
    body.requirements.length ? `Needs: ${body.requirements.map((req) => req.en).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
  return {
    id,
    roles: [body.matchRole ?? form.roleId],
    title: body.title,
    summary: body.summary,
    employer: form.business,
    area: form.area,
    publisher: "Daari",
    applyLink: "",
    postedAt,
    salaryText: payText(form),
    salaryMin: low === null ? null : form.payPeriod === "day" ? low * WORKING_DAYS : low,
    genderRestriction: null,
    requirements: body.requirements,
    signals: { asks_payment: body.signals.asks_payment, asks_sensitive: body.signals.asks_sensitive, unrealistic: body.signals.unrealistic },
    description,
    direct: true,
    timings: body.timings,
  };
}

/** A ten-digit Indian mobile number, from whatever way it was typed. */
export const mobileSchema = z
  .string()
  .max(20)
  .transform((value) => value.replace(/\D/g, "").slice(-10))
  .refine((digits) => /^[6-9]\d{9}$/.test(digits));

/**
 * What an applicant agrees to send to one employer. It is a copy taken when they apply, so later
 * changes to their profile are never shown to employers they did not send them to.
 */
export const applicantCardSchema = z.object({
  name: text(120).min(1),
  phone: mobileSchema,
  area: text(120),
  education: text(300),
  skills: z.array(text(120)).max(20),
  experience: z.array(z.object({ role: text(160), place: text(160), years: text(40) })).max(8),
  languages: z.array(text(60)).max(10),
  /** Their own yes or no to each of the posting's requirements, by requirement id. */
  answers: z.record(z.string().max(10), z.boolean()),
  note: text(600),
  lang: langSchema,
});
export type ApplicantCard = z.infer<typeof applicantCardSchema>;

export const APPLICANT_STATUSES = ["new", "shortlisted", "rejected", "hired"] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export const REPORT_REASONS = ["asks_money", "fake", "rude", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Where a person who applied stands, as they see it. */
export type MyApplication = { status: ApplicantStatus; seen: boolean; at: string; postingState: PostingState };

/** What the employer sees for each person who applied. */
export type Applicant = { id: string; card: ApplicantCard; status: ApplicantStatus; at: string };

export type PostingSummary = {
  id: string;
  body: PostingBody;
  state: PostingState;
  createdAt: string;
  expiresAt: string;
  applicants: number;
  fresh: number;
};

/**
 * A path to return to after signing in. Only a path on this site is accepted, so a link cannot use
 * the sign-in page to send someone elsewhere.
 */
export function safeNext(value: string | null | undefined): string {
  // Browsers drop tabs and line breaks from addresses, so "/\t/site" would become "//site": refuse any.
  if (!value || !/^\/(?![/\\])[^\s\\]*$/.test(value)) return "/";
  if (value.startsWith("/api/") || value.startsWith("/login")) return "/";
  return value;
}
