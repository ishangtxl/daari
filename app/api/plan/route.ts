import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { chatJson, looseText } from "@/lib/server/llm";
import { planPrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { findVideos } from "@/lib/server/youtube";
import { langSchema } from "@/lib/types";

type Course = { id: string; source: string; title: string; url: string; topics: string[] };
const courses = (): Course[] => JSON.parse(readFileSync(path.join(process.cwd(), "data/courses.json"), "utf8"));

const schema = z.object({ lang: langSchema, gaps: z.array(z.string().max(300)).min(1).max(12), work: z.string().max(300).default("") });

const planSchema = z.object({
  steps: z
    .array(
      z.object({
        title: looseText,
        why: looseText,
        time: looseText,
        course_id: z.string().nullable().default(null),
        youtube_query: looseText,
        practice: looseText,
      }),
    )
    .max(4),
});

export const POST = jsonRoute("plan", schema, async ({ lang, gaps, work }) => {
  const catalog = courses();
  const listing = catalog.map(({ id, source, title, topics }) => ({ id, source, title, topics }));
  const { steps } = await chatJson("plan", planSchema, [
    { role: "system", content: planPrompt(lang) },
    { role: "user", content: JSON.stringify({ wanted_work: work, gaps, courses: listing }) },
  ]);
  return {
    steps: await Promise.all(
      steps.map(async ({ course_id, youtube_query, ...step }) => {
        // The model picks by id, so a link can only ever be one from the verified list.
        const course = catalog.find((item) => item.id === course_id);
        return {
          ...step,
          course: course ? { source: course.source, title: course.title, url: course.url } : null,
          videos: await findVideos(youtube_query, `${step.title}. ${step.why}`, lang),
          youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(youtube_query)}`,
        };
      }),
    ),
  };
}, 15);
