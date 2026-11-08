import { z } from "zod";

export const LANGS = ["en", "hi", "kn"] as const;
export const langSchema = z.enum(LANGS);
export type Lang = z.infer<typeof langSchema>;
export type Localized = Record<Lang, string>;

export const profileSchema = z.object({
  name: z.string().max(120).default(""),
  phone: z.string().max(30).default(""),
  area: z.string().max(120).default(""),
  education: z.string().max(300).default(""),
  hasIti: z.boolean().nullable().default(null),
  hasDrivingLicence: z.boolean().nullable().default(null),
  skills: z.array(z.string().max(120)).max(40).default([]),
  experience: z
    .array(z.object({ role: z.string().max(160), place: z.string().max(160).default(""), years: z.string().max(40).default("") }))
    .max(12)
    .default([]),
  wantedWork: z.array(z.string().max(120)).max(10).default([]),
  languages: z.array(z.string().max(60)).max(10).default([]),
  // The person's own words. Everything claimed about them must be traceable to this text.
  words: z.string().max(12000).default(""),
  // Answers to "can you do this?" from job pages, keyed by requirement text.
  confirmed: z.record(z.string(), z.boolean()).default({}),
});
export type Profile = z.infer<typeof profileSchema>;

export const emptyProfile = (): Profile => profileSchema.parse({});

export type Requirement = { id: string; kind: string } & Localized;

export type Job = {
  id: string;
  roles: string[];
  title: Localized;
  summary: Localized;
  employer: string;
  area: string;
  publisher: string;
  applyLink: string;
  postedAt: string | null;
  salaryText: string | null;
  salaryMin: number | null;
  genderRestriction: "male" | "female" | null;
  requirements: Requirement[];
  signals: { asks_payment: number; asks_sensitive: number; unrealistic: number };
  description: string;
};

export type StopStatus = "met" | "gap" | "unsure";
export type MatchedJob = Omit<Job, "description"> & {
  stops: { id: string; status: StopStatus }[];
  met: number;
  /** How well the work itself fits this person, from 0 to 1. */
  fit: number;
};

export type ResumeData = {
  name: string;
  phone: string;
  area: string;
  headline: string;
  summary: string;
  skills: string[];
  experience: { role: string; place: string; duration: string; bullets: string[] }[];
  education: string[];
  languages: string[];
};

export const resumeSchema = z.object({
  name: z.string().max(120).default(""),
  phone: z.string().max(30).default(""),
  area: z.string().max(120).default(""),
  headline: z.string().max(160).default(""),
  summary: z.string().max(800).default(""),
  skills: z.array(z.string().max(120)).max(30).default([]),
  experience: z
    .array(
      z.object({
        role: z.string().max(160).default(""),
        place: z.string().max(160).default(""),
        duration: z.string().max(60).default(""),
        bullets: z.array(z.string().max(300)).max(8).default([]),
      }),
    )
    .max(10)
    .default([]),
  education: z.array(z.string().max(200)).max(8).default([]),
  languages: z.array(z.string().max(60)).max(10).default([]),
});

export type BusinessProofType = "gstin" | "udyam" | "merchant_upi" | "storefront" | "none";

export type BusinessVerification = {
  proofType: BusinessProofType;
  proofValue?: string;
  isVerified: boolean;
  businessName: string;
  businessAddress: string;
  locality: string;
  pincode?: string;
};

export type PostedJobMetadata = {
  source: "direct_employer";
  posterPhone: string;
  posterName?: string;
  posterId: string;
  verification: BusinessVerification;
  whatsappContact: string;
  status: "active" | "rejected" | "paused";
  rejectionReason?: string;
  createdAt: string;
  expiresAt: string;
};

export type FullJob = Job & {
  metadata?: PostedJobMetadata;
};

