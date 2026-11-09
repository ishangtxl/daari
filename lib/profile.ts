import type { Profile } from "./types";

/**
 * Applies a fresh reading of everything the person has said. Each reading covers all their words,
 * so lists are replaced, not added to, which avoids near-duplicates like "Replacing screens" and
 * "Screen replacement". Name and phone they typed are never overwritten.
 */
export function mergeProfile(current: Profile, next: Partial<Profile>): Profile {
  const pick = <K extends "name" | "phone" | "education">(key: K) => current[key] || next[key] || "";
  const list = (known: string[], fresh: string[] | undefined) => (fresh?.length ? fresh : known);
  return {
    ...current,
    goal: next.goal || current.goal || "",
    name: pick("name"),
    phone: pick("phone"),
    area: next.area || current.area || "",
    education: next.education || current.education,
    hasIti: next.hasIti ?? current.hasIti,
    hasDrivingLicence: next.hasDrivingLicence ?? current.hasDrivingLicence,
    skills: list(current.skills, next.skills).slice(0, 40),
    wantedWork: list(current.wantedWork, next.wantedWork).slice(0, 10),
    languages: list(current.languages, next.languages).slice(0, 10),
    experience: next.experience?.length ? next.experience : current.experience,
  };
}
