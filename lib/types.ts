import { z } from "zod";

export const LANGS = ["en", "hi", "kn"] as const;
export const langSchema = z.enum(LANGS);
export type Lang = z.infer<typeof langSchema>;
export type Localized = Record<Lang, string>;

export const GOALS = ["job", "learn", "resume", "unsure"] as const;
export type Goal = (typeof GOALS)[number];

export const profileSchema = z.object({
  // What they came for. Empty until they say, so the counsellor asks first.
  goal: z.enum(["", ...GOALS]).catch("").default(""),
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
  /** Present on listings posted directly by a shop. */
  metadata?: PostedJobMetadata;
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
  /** Role as typed/selected by the employer; used with business + locality to detect duplicate postings. */
  roleCategory?: string;
  posterPhone: string;
  posterName?: string;
  posterId: string;
  verification: BusinessVerification;
  whatsappContact: string;
  status: "active" | "rejected" | "paused";
  rejectionReason?: string;
  createdAt: string;
  expiresAt: string;
  /** Promoted listing. Set by the server from the database; already false once `featuredUntil` has passed. */
  isFeatured?: boolean;
  featuredUntil?: string;
  featuredRequested?: boolean;
};

export type FullJob = Job & {
  metadata?: PostedJobMetadata;
};

/** A promoted listing that has not run out. */
export const isFeaturedJob = (job: { metadata?: Pick<PostedJobMetadata, "isFeatured" | "featuredUntil"> }) =>
  Boolean(job.metadata?.isFeatured && (!job.metadata.featuredUntil || job.metadata.featuredUntil > new Date().toISOString()));

export const APPLICANT_STATUSES = ["new", "shortlisted", "rejected", "hired"] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

/** What a seeker's profile looked like when they applied. Later profile edits do not change it. */
export type ApplicantSnapshot = {
  name: string;
  phone: string;
  area: string;
  skills: string[];
  experience: { role: string; years: string }[];
  languages: string[];
  education: string;
};

/** An applicant as a provider sees them. `phone` stays null until the provider shortlists them. */
export type Applicant = Omit<ApplicantSnapshot, "phone"> & {
  id: number;
  listingId: string;
  status: ApplicantStatus;
  appliedAt: string;
  phone: string | null;
};

export type ListingApplicants = {
  listing: {
    id: string;
    title: Localized;
    employer: string;
    area: string;
    status: PostedJobMetadata["status"];
    featured: boolean;
    featuredRequested: boolean;
  };
  applicants: Applicant[];
};

/** A YouTube video or playlist picked for a learning step. */
export type Video = {
  kind: "video" | "playlist";
  title: string;
  channel: string;
  url: string;
  thumbnail: string;
  /** "12:05" for a video, the number of videos for a playlist. */
  length: string;
};

export const ROAD_ACTIONS = ["jobs", "learn", "resume", "check", "talk"] as const;
export type RoadAction = (typeof ROAD_ACTIONS)[number];

/** The plan Daari suggests once it understands someone: a few steps, each done in one part of the app. */
export type Roadmap = {
  understood: string;
  destination: string;
  steps: { title: string; why: string; action: RoadAction }[];
  /** What they wanted when it was made, so a changed goal can offer a new plan. */
  goal: Profile["goal"];
  at: string;
};
