import { describe, expect, it } from "vitest";
import { sortJobs, unmetRequirementCount } from "../lib/rank";
import type { MatchedJob, StopStatus } from "../lib/types";

// Build jobs from all displayed requirements. Kinds deliberately vary because
// eligibility sorting must count skills, education, experience and other criteria.
const make = (
  id: string,
  statuses: StopStatus[],
  overrides: Partial<MatchedJob> = {},
  kinds: string[] = statuses.map(() => "skill"),
): MatchedJob => {
  const requirements = statuses.map((_, i) => ({
    id: `r${i}`,
    kind: kinds[i] ?? "other",
    en: `Requirement ${i + 1}`,
    hi: "",
    kn: "",
  }));
  const stops = statuses.map((status, i) => ({ id: `r${i}`, status }));
  return {
    id,
    roles: [],
    title: { en: id, hi: "", kn: "" },
    summary: { en: "", hi: "", kn: "" },
    employer: "",
    area: "",
    publisher: "",
    applyLink: "",
    postedAt: null,
    salaryText: null,
    salaryMin: null,
    genderRestriction: null,
    requirements,
    signals: { asks_payment: 0, asks_sensitive: 0, unrealistic: 0 },
    stops,
    met: stops.filter((stop) => stop.status === "met").length,
    fit: 0.9,
    ...overrides,
  };
};

const ids = (jobs: MatchedJob[]) => jobs.map((job) => job.id);

describe("unmetRequirementCount", () => {
  it("counts every unconfirmed requirement, regardless of kind", () => {
    const job = make("mixed", ["met", "unsure", "gap", "met"], {}, ["skill", "education", "experience", "other"]);
    expect(unmetRequirementCount(job)).toBe(2);
  });
});

describe("sortJobs by eligibility", () => {
  it("ranks by the share of requirements met: k of k first, then k-1 of k, and so on", () => {
    const jobs = [
      make("one-of-four", ["met", "gap", "gap", "gap"], {}, ["skill", "education", "experience", "other"]),
      make("one-of-five", ["met", "gap", "gap", "gap", "gap"]),
      make("two-of-two-a", ["met", "met"], {}, ["skill", "education"]),
      make("two-of-five", ["met", "met", "gap", "gap", "gap"]),
      make("one-of-two", ["met", "gap"], {}, ["skill", "education"]),
      make("two-of-two-b", ["met", "met"], {}, ["skill", "other"]),
      make("one-of-one", ["met"]),
      make("three-of-four", ["met", "met", "met", "gap"]),
      make("two-of-four", ["met", "met", "gap", "gap"]),
    ];

    expect(ids(sortJobs(jobs, "qualification"))).toEqual([
      "two-of-two-a",
      "two-of-two-b",
      "one-of-one",
      "three-of-four",
      "two-of-four",
      "one-of-two",
      "two-of-five",
      "one-of-four",
      "one-of-five",
    ]);
  });

  it("never ranks a job where nothing is met above one where something is", () => {
    const jobs = [make("none-of-two", ["gap", "gap"]), make("two-of-five", ["met", "met", "gap", "gap", "gap"]), make("none-of-six", ["gap", "gap", "gap", "gap", "gap", "gap"])];
    expect(ids(sortJobs(jobs, "qualification"))).toEqual(["two-of-five", "none-of-two", "none-of-six"]);
  });

  it("keeps recommended order when eligibility is equal", () => {
    const jobs = [make("a", ["met", "gap"]), make("b", ["met", "gap"]), make("c", ["met", "gap"] )];
    expect(ids(sortJobs(jobs, "qualification"))).toEqual(["a", "b", "c"]);
  });

  it("does not lift a risky listing above safer listings", () => {
    const risky = make("risky", ["met", "met"], { signals: { asks_payment: 0.9, asks_sensitive: 0, unrealistic: 0 } });
    expect(ids(sortJobs([risky, make("safe", ["gap", "gap", "gap"])], "qualification"))).toEqual(["safe", "risky"]);
  });
});

describe("sortJobs by pay and distance", () => {
  it("sorts by pay with unknown pay last, and keeps scam-looking pay off the top", () => {
    const jobs = [
      make("none", []),
      make("low", [], { salaryMin: 9000 }),
      make("scam", [], { salaryMin: 90000, signals: { asks_payment: 0.9, asks_sensitive: 0, unrealistic: 0 } }),
      make("high", [], { salaryMin: 20000 }),
    ];
    expect(ids(sortJobs(jobs, "salary"))).toEqual(["high", "low", "none", "scam"]);
  });

  it("sorts by distance with unknown distance last", () => {
    const jobs = [make("far", []), make("unknown", []), make("near", [])];
    expect(ids(sortJobs(jobs, "distance", { far: 12, near: 2, unknown: null }))).toEqual(["near", "far", "unknown"]);
  });

  it("leaves the recommended order alone", () => {
    const jobs = [make("b", []), make("a", [])];
    expect(ids(sortJobs(jobs, "recommended"))).toEqual(["b", "a"]);
  });
});

describe("sortJobs by featured", () => {
  const star = { metadata: { isFeatured: true } as never };

  it("moves featured listings up, keeping the rest in their original order", () => {
    const jobs = [make("a", []), make("star1", [], star), make("b", []), make("star2", [], star)];
    expect(ids(sortJobs(jobs, "featured"))).toEqual(["star1", "star2", "a", "b"]);
  });

  it("keeps risky featured listings last", () => {
    const risky = make("risky", [], { ...star, signals: { asks_payment: 0.9, asks_sensitive: 0, unrealistic: 0 } });
    expect(ids(sortJobs([risky, make("plain", [])], "featured"))).toEqual(["plain", "risky"]);
  });
});
