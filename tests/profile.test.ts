import { describe, expect, it } from "vitest";
import { translate } from "../lib/i18n";
import { parsePay } from "../lib/pay";
import { mergeProfile } from "../lib/profile";
import { parseJson } from "../lib/server/llm";
import { emptyProfile } from "../lib/types";

describe("mergeProfile", () => {
  it("never overwrites a name the person typed", () => {
    const merged = mergeProfile({ ...emptyProfile(), name: "Ravi" }, { name: "Someone Else" });
    expect(merged.name).toBe("Ravi");
  });

  it("replaces lists with the fresh reading, and keeps them when a reading finds nothing", () => {
    const start = { ...emptyProfile(), skills: ["Replacing screens"] };
    expect(mergeProfile(start, { skills: ["Screen replacement", "Soldering"] }).skills).toEqual(["Screen replacement", "Soldering"]);
    expect(mergeProfile(start, { skills: [] }).skills).toEqual(["Replacing screens"]);
  });

  it("does not forget a known answer when new text does not mention it", () => {
    const merged = mergeProfile({ ...emptyProfile(), hasIti: false }, { hasIti: null });
    expect(merged.hasIti).toBe(false);
  });
});

describe("translate", () => {
  it("fills values in every language", () => {
    for (const lang of ["en", "hi", "kn"] as const) {
      expect(translate(lang, "meets", { met: 4, total: 6 })).toContain("4");
      expect(translate(lang, "meets", { met: 4, total: 6 })).not.toContain("{");
    }
  });

  it("provides login branding and feature copy in en, hi, and kn", () => {
    const keys = [
      "loginHeroTitle",
      "loginHeroSubtitle",
      "loginFeature1Title",
      "loginFeature1Desc",
      "loginFeature2Title",
      "loginFeature2Desc",
      "loginFeature3Title",
      "loginFeature3Desc",
    ] as const;
    for (const lang of ["en", "hi", "kn"] as const) {
      for (const key of keys) {
        const text = translate(lang, key);
        expect(text).toBeTruthy();
        expect(text.trim().length).toBeGreaterThan(5);
      }
    }
  });
});

describe("parseJson", () => {
  it("reads JSON wrapped in a sentence or a code fence", () => {
    expect(parseJson('We need to extract this. {"a": 1}')).toEqual({ a: 1 });
    expect(parseJson('```json\n{"a": {"b": 2}}\n```')).toEqual({ a: { b: 2 } });
  });

  it("repairs raw newlines inside string values without breaking pretty-printed JSON", () => {
    expect(parseJson('{\n  "a": "line one\nline two",\n  "b": {"c": "x"}\n}')).toEqual({
      a: "line one\nline two",
      b: { c: "x" },
    });
  });

  it("rejects a reply with no JSON", () => {
    expect(() => parseJson("Sorry, I cannot do that.")).toThrow();
  });
});

describe("parsePay", () => {
  it("makes ranges consistent, with Indian digit grouping", () => {
    expect(parsePay("Rs. 15000 - Rs. 20000")).toEqual({ amount: "₹15,000 – ₹20,000", period: "month" });
    expect(parsePay("Rs 300,000 to 500,000 per year")).toEqual({ amount: "₹3,00,000 – ₹5,00,000", period: "year" });
    expect(parsePay("3 to 5 LPA")).toEqual({ amount: "₹3,00,000 – ₹5,00,000", period: "year" });
  });

  it("ignores figures that are not pay", () => {
    expect(parsePay("Rs 18,000 for 8 hours a day")?.amount).toBe("₹18,000");
    expect(parsePay("As per company norms")).toBeNull();
    expect(parsePay(null)).toBeNull();
  });
});
