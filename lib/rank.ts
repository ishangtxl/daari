import type { MatchedJob } from "./types";

export type JobSort = "recommended" | "distance" | "qualification" | "salary";

/** Listings that ask for money or sensitive details never float to the top of any list. */
export const isRisky = (job: MatchedJob) => job.signals.asks_payment >= 0.7 || job.signals.asks_sensitive >= 0.7;

// Overall recommendations prioritize work-type fit. The eligibility sort is deliberately
// different: it uses the exact same all-requirements count shown on each job card
// ("You meet X of Y"), not just requirements whose kind is "skill".
const FIT_BANDS = [0.7, 0.4];
export const fitBand = (fit: number) => FIT_BANDS.findIndex((floor) => fit >= floor) + 1 || FIT_BANDS.length + 1;

/** Number of listed requirements the person has not yet been shown to meet. */
export function unmetRequirementCount(job: MatchedJob) {
  return Math.max(0, job.stops.length - job.met);
}

const requirementShare = (job: MatchedJob) => (job.stops.length ? job.met / job.stops.length : 0);

/**
 * Eligibility sort: the share of listed requirements met, highest first. k of k comes first, then
 * k-1 of k, and so on. A job where nothing is met never beats one where something is. When the
 * share is equal, the job with more requirements met comes first (2 of 2 before 1 of 1). The
 * incoming recommended order is retained for any remaining ties.
 */
function byQualification(a: MatchedJob, b: MatchedJob) {
  return requirementShare(b) - requirementShare(a) || b.met - a.met;
}

const KM_UNKNOWN = Number.POSITIVE_INFINITY;

/**
 * Orders an already-ranked list. "recommended" keeps the incoming order; every other sort is
 * stable on it, so ties fall back to the recommended ranking instead of shuffling.
 */
export function sortJobs(jobs: MatchedJob[], mode: JobSort, distanceKm?: Record<string, number | null> | null): MatchedJob[] {
  if (mode === "recommended") return [...jobs];
  const position = new Map(jobs.map((job, index) => [job.id, index]));
  const km = (job: MatchedJob) => distanceKm?.[job.id] ?? KM_UNKNOWN;
  const pay = (job: MatchedJob) => job.salaryMin ?? Number.NEGATIVE_INFINITY;
  const byMode = (a: MatchedJob, b: MatchedJob) => {
    if (mode === "qualification") return byQualification(a, b);
    if (mode === "distance") return km(a) === km(b) ? 0 : km(a) - km(b);
    return pay(a) === pay(b) ? 0 : pay(b) - pay(a);
  };
  return [...jobs].sort(
    (a, b) => Number(isRisky(a)) - Number(isRisky(b)) || byMode(a, b) || position.get(a.id)! - position.get(b.id)!,
  );
}
