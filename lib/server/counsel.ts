import type { Goal, Profile } from "../types";
import { nouls } from "./jev";

const READY = 0.7;

// What else a plan needs, by what they came for. Asking for all of it from everyone held plans back:
// someone learning towards "an accounts job" read as a job seeker whose area was still unknown.
const EXTRA: Record<Goal, string> = {
  job: " Since they want a job, we also know roughly where in Bangalore they live and what kind of work they want.",
  learn: " Since they want to learn, we also know what kind of work they hope to do after learning.",
  resume: " Since they want a resume, we also know what work they have done, or that they have not worked yet.",
  unsure: "",
};

const GOAL_WORDS: Record<Goal, string> = { job: "finding a job", learn: "learning a skill", resume: "making a resume", unsure: "not sure yet" };

/**
 * Whether the conversation has covered enough to suggest a plan, so the counsellor can stop asking
 * and hand one over. A fast yes/no decision, run before each reply until a plan exists.
 */
export async function readyForPlan(profile: Profile, transcript: string): Promise<boolean> {
  const goal = profile.goal || null;
  const state = `${transcript.slice(-6000)}${goal ? `\nThey want help with: ${GOAL_WORDS[goal]}.` : ""}`;
  const { ready } = await nouls(state, {
    ready: `We know enough about this person to suggest a sensible plan: what they want help with (a job, learning, a resume, or being unsure counts), their education, and what they can do or have done, even if that is nothing yet.${goal ? EXTRA[goal] : ""}`,
  });
  return ready >= READY;
}
