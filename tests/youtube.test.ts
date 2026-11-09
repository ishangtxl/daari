import { describe, expect, it } from "vitest";
import { clock, decodeEntities, durationSeconds } from "../lib/server/youtube";

describe("youtube helpers", () => {
  it("reads YouTube durations, so Shorts can be dropped", () => {
    expect(durationSeconds("PT45S")).toBe(45);
    expect(durationSeconds("PT12M5S")).toBe(725);
    expect(durationSeconds("PT1H2M")).toBe(3720);
    expect(durationSeconds("P1D")).toBe(0);
  });

  it("formats lengths like YouTube does", () => {
    expect(clock(725)).toBe("12:05");
    expect(clock(3725)).toBe("1:02:05");
  });

  it("decodes entities in titles", () => {
    expect(decodeEntities("Don&#39;t miss &quot;this&quot; &amp; that")).toBe('Don\'t miss "this" & that');
  });
});

describe("wrongLanguage", () => {
  it("keeps Hindi lessons for Hindi speakers only", async () => {
    const { wrongLanguage } = await import("../lib/server/youtube");
    const hindi = "मल्टीमीटर से Full & Half Shorting चेक करना सीखें";
    expect(wrongLanguage(hindi, "hi")).toBe(false);
    expect(wrongLanguage(hindi, "kn")).toBe(true);
    expect(wrongLanguage(hindi, "en")).toBe(true);
    expect(wrongLanguage("How to use multimeter in hindi", "en")).toBe(true);
  });

  it("keeps Kannada and English lessons for Kannada speakers", async () => {
    const { wrongLanguage } = await import("../lib/server/youtube");
    expect(wrongLanguage("How To Using Digital Multimeter ಇನ್ ಕನ್ನಡ", "kn")).toBe(false);
    expect(wrongLanguage("Complete Cell Phone Motherboard Repair Course", "kn")).toBe(false);
    expect(wrongLanguage("Mobile repair in Tamil", "kn")).toBe(true);
  });
});
