import { z } from "zod";
import { nouls } from "@/lib/server/jev";
import { chatJson } from "@/lib/server/llm";
import { evidence } from "@/lib/server/match";
import { resumePrompt } from "@/lib/server/prompts";
import { jsonRoute } from "@/lib/server/route";
import { langSchema, profileSchema, resumeSchema } from "@/lib/types";

const schema = z.object({ lang: langSchema, profile: profileSchema });
const draftSchema = resumeSchema.omit({ name: true, phone: true, area: true }).extend({ review: z.array(z.string()).default([]) });

// Below this, the person's own words do not support the line, so it is removed instead of risking a false claim.
const SUPPORT_THRESHOLD = 0.4;

export const POST = jsonRoute("resume-build", schema, async ({ lang, profile }) => {
  const state = evidence(profile);
  const { review, ...draft } = await chatJson("resume", draftSchema, [
    { role: "system", content: resumePrompt(lang) },
    { role: "user", content: state },
  ], { role: "resume", maxTokens: 2000 });

  const bullets = draft.experience.flatMap((item, itemIndex) =>
    item.bullets.map((text, bulletIndex) => ({ key: `b${itemIndex}_${bulletIndex}`, text })),
  );
  const supported = bullets.length
    ? await nouls(state, Object.fromEntries(bullets.map(({ key, text }) => [key, {
        type: "noul" as const,
        instructions: `What the person said supports this resume claim: ${text}`,
        criteria: { true: "They said or clearly showed this", false: "It adds something they never said" },
      }])))
    : {};
  const removed: string[] = [];
  const experience = draft.experience.map((item, itemIndex) => ({
    ...item,
    bullets: item.bullets.filter((text, bulletIndex) => {
      const keep = (supported[`b${itemIndex}_${bulletIndex}`] ?? 1) >= SUPPORT_THRESHOLD;
      if (!keep) removed.push(text);
      return keep;
    }),
  }));

  return {
    resume: { ...draft, experience, name: profile.name, phone: profile.phone, area: profile.area },
    review,
    removed,
  };
}, 10);
