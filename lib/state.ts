/**
 * Everything Daari keeps for one account, with the limits the server checks on every write.
 * The browser and the server share these schemas, so a saved value always has the shape the
 * pages expect when it is loaded back on another device.
 */

import { z } from "zod";
import { GOALS, langSchema, profileSchema, resumeSchema, ROAD_ACTIONS } from "./types";

const text = (max: number) => z.string().max(max);
const localized = z.object({ en: text(300), hi: text(300), kn: text(300) });

export const videoSchema = z.object({
  kind: z.enum(["video", "playlist"]),
  title: text(300),
  channel: text(200),
  url: text(300),
  thumbnail: text(500),
  length: text(20),
});

export const roadmapSchema = z.object({
  understood: text(1200),
  destination: text(300),
  steps: z.array(z.object({ title: text(300), why: text(600), action: z.enum(ROAD_ACTIONS) })).max(6),
  goal: z.enum(["", ...GOALS]).catch(""),
  at: text(40),
});

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(40),
  role: z.enum(["user", "assistant"]),
  content: text(4000),
  roadmap: roadmapSchema.optional(),
});

export const planStepSchema = z.object({
  title: text(300),
  why: text(600),
  time: text(200),
  practice: text(800),
  youtube: text(600),
  videos: z.array(videoSchema).max(4).optional(),
  course: z.object({ source: text(60), title: text(300), url: text(600) }).nullable(),
});

export const APPLICATION_STATUSES = ["statusApplied", "statusCalled", "statusInterview", "statusOffer", "statusNoReply"] as const;

export const applicationSchema = z.object({
  jobId: z.string().min(1).max(80),
  title: localized,
  employer: text(300),
  applyLink: text(1000),
  status: z.enum(APPLICATION_STATUSES),
  at: text(40),
});

// Matched jobs come from the server's own catalog, so only their size is limited here.
const jobsSchema = z.array(z.record(z.string(), z.unknown())).max(40);

/** The parts of an account saved as one document each. Messages and applications have their own tables. */
export const documentSchemas = {
  lang: langSchema.nullable(),
  profile: profileSchema,
  roadmap: roadmapSchema.nullable(),
  plan: z.array(planStepSchema).max(6).nullable(),
  resume: resumeSchema.nullable(),
  resumeReview: z.array(text(600)).max(60),
  resumeRemoved: z.array(text(600)).max(60),
  jobs: jobsSchema.nullable(),
  roles: z.array(text(80)).max(12),
  jobsKey: text(4000),
};
export type DocumentKind = keyof typeof documentSchemas;
export const DOCUMENT_KINDS = Object.keys(documentSchemas) as DocumentKind[];

/** A save from the browser: only the parts that changed. Unknown keys are refused, not ignored. */
export const statePatchSchema = z
  .object({ ...documentSchemas, applications: z.array(applicationSchema).max(200) })
  .partial()
  .strict();
export type StatePatch = z.infer<typeof statePatchSchema>;

export const newMessagesSchema = z.object({ messages: z.array(chatMessageSchema).min(1).max(100) });

export type Video = z.infer<typeof videoSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;
export type Application = z.infer<typeof applicationSchema>;
export type ApplicationStatus = Application["status"];
