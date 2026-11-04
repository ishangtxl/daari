import { describe, expect, it } from "vitest";
import { rankMatches, stopStatus, toMatched } from "../lib/server/match";
import type { Job, MatchedJob } from "../lib/types";

const job = (overrides: Partial<Job> = {}): Job => ({
  id: "j",
  roles: ["mobile_repair"],
  title: { en: "Tech", hi: "", kn: "" },
  summary: { en: "", hi: "", kn: "" },
  employer: "Shop",
  area: "Jayanagar",
  publisher: "Apna",
  applyLink: "https://example.com",
  postedAt: "2026-11-01T00:00:00Z",
  salaryText: null,
  salaryMin: null,
  genderRestriction: null,
  requirements: [
    { id: "r0", kind: "skill", en: "Can replace screens", hi: "", kn: "" },
    { id: "r1", kind: "education", en: "Has ITI", hi: "", kn: "" },
    { id: "r2", kind: "skill", en: "Chip level repair", hi: "", kn: "" },
  ],
  signals: { asks_payment: 0, asks_sensitive: 0, unrealistic: 0 },
  description: "private",
  ...overrides,
});

describe("stopStatus", () => {
  it("sends uncertain answers back to the person", () => {
    expect(stopStatus(0.7)).toBe("met");
    expect(stopStatus(0.5)).toBe("unsure");
    expect(stopStatus(0.3)).toBe("gap");
  });
});

describe("toMatched", () => {
  it("counts met stops and drops the raw description", () => {
    const matched = toMatched(job(), { r0: 0.9, r1: 0.1, r2: 0.5 }, {});
    expect(matched.met).toBe(1);
    expect(matched.stops.map((stop) => stop.status)).toEqual(["met", "gap", "unsure"]);
    expect(matched).not.toHaveProperty("description");
  });

  it("lets what the person confirmed override the model", () => {
    const matched = toMatched(job(), { r0: 0.1, r1: 0.9, r2: 0.5 }, { "Can replace screens": true, "Has ITI": false });
    expect(matched.stops[0].status).toBe("met");
    expect(matched.stops[1].status).toBe("gap");
  });
});

describe("rankMatches", () => {
  const matched = (id: string, met: number, payment = 0, fit = 0.9): MatchedJob => ({
    ...toMatched(job({ id, signals: { asks_payment: payment, asks_sensitive: 0, unrealistic: 0 } }), {}, {}, fit),
    met,
  });

  it("ranks the right kind of work above easy requirements", () => {
    expect(rankMatches([matched("easy-receptionist", 3, 0, 0.2), matched("technician", 1, 0, 0.9)]).map((item) => item.id)).toEqual(["technician", "easy-receptionist"]);
  });

  it("puts the closest fits first", () => {
    expect(rankMatches([matched("a", 1), matched("b", 3)]).map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("sinks listings that ask for money, however well they fit", () => {
    expect(rankMatches([matched("risky", 3, 0.9), matched("safe", 0)]).map((item) => item.id)).toEqual(["safe", "risky"]);
  });
});
