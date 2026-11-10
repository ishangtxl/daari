import { readFileSync } from "node:fs";
import path from "node:path";
import { ROLES } from "../roles";
import type { Job, MatchedJob, Profile, StopStatus } from "../types";
import { fitBand, isRisky } from "../rank";
import { decide, type Question } from "./jev";
import { postings } from "./postings";

let catalog: Job[] | null = null;

export function allJobs(): Job[] {
  catalog ??= JSON.parse(readFileSync(path.join(process.cwd(), "data/jobs.json"), "utf8")) as Job[];
  return catalog;
}

/** A job from the catalog, or one posted on Daari, open or not. */
export const jobById = (id: string) => allJobs().find((job) => job.id === id) ?? postings().job(id)?.job;

/** What the person has said about themselves, used as the evidence for every decision. */
export function evidence(profile: Profile) {
  const lines = [profile.words.slice(-6000)];
  const facts = {
    education: profile.education,
    iti: profile.hasIti,
    driving_licence: profile.hasDrivingLicence,
    skills: profile.skills,
    experience: profile.experience,
    wants: profile.wantedWork,
    languages: profile.languages,
  };
  lines.push(`Details: ${JSON.stringify(facts)}`);
  return lines.join("\n");
}

export const hasEnoughToMatch = (profile: Profile) =>
  profile.words.trim().length > 15 || profile.skills.length > 0 || profile.experience.length > 0 || profile.wantedWork.length > 0;

export async function pickRoles(profile: Profile, limit = 4): Promise<string[]> {
  const answers = await decide(evidence(profile), {
    role: {
      type: "choice",
      instructions: "Which kind of job best fits this person's experience, skills and what they want?",
      criteria: Object.fromEntries(ROLES.map((role) => [role.id, role.en])),
    },
  });
  const probabilities = answers.role.probabilities ?? {};
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .filter(([, probability], index) => index === 0 || probability >= 0.02)
    .map(([id]) => id);
}

// Thresholds follow TypeSafe's guidance: unsure answers go back to the person, not into either path.
export function stopStatus(probability: number): StopStatus {
  if (probability >= 0.7) return "met";
  if (probability <= 0.3) return "gap";
  return "unsure";
}

export function checkQuestion(requirement: string): Extract<Question, { type: "noul" }> {
  return {
    type: "noul",
    instructions: `The person clearly meets this job requirement: ${requirement}`,
    criteria: {
      true: "Their own words state or directly show that they meet it",
      false: "They say they do not meet it, or they never mention it",
    },
  };
}

export function fitQuestion(job: Job): Extract<Question, { type: "noul" }> {
  return {
    type: "noul",
    instructions: `This job is the same kind of work this person has done or says they want: ${job.title.en}. ${job.summary.en}`,
  };
}

export function toMatched(job: Job, scores: Record<string, number>, confirmed: Profile["confirmed"], fit = 0.5): MatchedJob {
  const stops = job.requirements.map((req) => {
    const answer = confirmed[req.en];
    const status: StopStatus = answer === true ? "met" : answer === false ? "gap" : stopStatus(scores[req.id] ?? 0);
    return { id: req.id, status };
  });
  const { description: _description, ...rest } = job;
  return { ...rest, stops, fit, met: stops.filter((stop) => stop.status === "met").length };
}

export function rankMatches(jobs: MatchedJob[]) {
  const share = (job: MatchedJob) => (job.stops.length ? job.met / job.stops.length : 0);
  return [...jobs].sort(
    (a, b) =>
      Number(isRisky(a)) - Number(isRisky(b)) ||
      fitBand(a.fit) - fitBand(b.fit) ||
      // Among jobs that fit as well, one posted on Daari comes first: it can be applied to right here.
      Number(Boolean(b.direct)) - Number(Boolean(a.direct)) ||
      share(b) - share(a) ||
      b.met - a.met ||
      new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime(),
  );
}

const MIN_FIT = 0.15;

export async function matchJobs(profile: Profile, limit = 24, posted: Job[] = postings().liveJobs()): Promise<{ jobs: MatchedJob[]; roles: string[] }> {
  const roles = await pickRoles(profile);
  const roleRank = new Map(roles.map((id, index) => [id, index]));
  // Jobs posted on Daari go first, so the limit never cuts them in favour of the catalog's.
  const candidates = [...posted, ...allJobs()]
    .filter((job) => job.roles.some((id) => roleRank.has(id)))
    .sort((a, b) => Math.min(...a.roles.map((id) => roleRank.get(id) ?? 99)) - Math.min(...b.roles.map((id) => roleRank.get(id) ?? 99)))
    .slice(0, limit);

  const state = evidence(profile);
  const results: MatchedJob[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (next < candidates.length) {
        const job = candidates[next++];
        const questions = { fit: fitQuestion(job), ...Object.fromEntries(job.requirements.map((req) => [req.id, checkQuestion(req.en)])) };
        try {
          const answers = await decide(state, questions);
          const scores = Object.fromEntries(job.requirements.map((req) => [req.id, answers[req.id]?.noul ?? 0.5]));
          const fit = answers.fit?.noul ?? 0.5;
          // Listings for clearly different work are noise, however easy their requirements are.
          if (fit >= MIN_FIT) results.push(toMatched(job, scores, profile.confirmed, fit));
        } catch (error) {
          console.error("[match]", job.id, error);
        }
      }
    }),
  );
  if (candidates.length && !results.length) throw new Error("All job checks failed");
  return { jobs: rankMatches(results), roles };
}
