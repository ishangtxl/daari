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
  /** Posted on Daari by the employer, so people apply here instead of on another site. */
  direct?: boolean;
  /** Working hours and days off, for jobs posted on Daari. */
  timings?: Localized | null;
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
