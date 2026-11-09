import type { ChatMessage } from "@/components/app-state";
import type { Application, PlanStep } from "@/components/app-state";
import type { ResumeData, RoadAction, Roadmap } from "@/lib/types";

/** The conversation with each line labelled, so the server can tell the person's words from Daari's. */
export function transcriptOf(messages: ChatMessage[]) {
  return messages
    .filter((message) => !message.roadmap)
    .map((message) => `${message.role === "user" ? "Person" : "Daari"}: ${message.content}`)
    .join("\n")
    .slice(-12000);
}

/** How a plan reads to the counsellor in later turns. */
export function roadText(roadmap: Roadmap) {
  return `${roadmap.understood} Plan: ${roadmap.steps.map((step) => step.title).join("; ")}.`;
}

export const ROAD_LINKS: Record<RoadAction, string> = { jobs: "/jobs", learn: "/learn", resume: "/me", check: "/check", talk: "/talk?type=1" };

/** A step counts as done once its page has produced something the person kept. */
export function stepDone(action: RoadAction, state: { applications: Application[]; plan: PlanStep[] | null; resume: ResumeData | null }) {
  if (action === "jobs") return state.applications.length > 0;
  if (action === "learn") return Boolean(state.plan?.length);
  if (action === "resume") return Boolean(state.resume);
  return false;
}
