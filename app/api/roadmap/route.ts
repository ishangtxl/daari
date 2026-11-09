import { z } from "zod";
import { chatJson, looseText } from "@/lib/server/llm";
import { roadmapPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema, profileSchema, ROAD_ACTIONS, type Roadmap } from "@/lib/types";

const schema = z.object({ lang: langSchema, profile: profileSchema, transcript: z.string().max(12000).default("") });

const roadSchema = z.object({
  understood: looseText,
  destination: looseText,
  steps: z.array(z.object({ title: looseText, why: looseText, action: z.enum(ROAD_ACTIONS).catch("talk") })).min(1).max(6),
});

export const POST = jsonRoute("roadmap", schema, async ({ lang, profile, transcript }): Promise<{ roadmap: Roadmap }> => {
  const { words: _words, confirmed: _confirmed, ...facts } = profile;
  const road = await chatJson("roadmap", roadSchema, [
    { role: "system", content: roadmapPrompt(lang) },
    { role: "user", content: JSON.stringify({ details: facts, conversation: transcript || profile.words }) },
  ]);
  // One step per part of the app, at most four, as the prompt asks.
  const seen = new Set<string>();
  const steps = road.steps.filter((step) => !seen.has(step.action) && seen.add(step.action)).slice(0, 4);
  return { roadmap: { ...road, steps, goal: profile.goal, at: new Date().toISOString() } };
}, 10);
