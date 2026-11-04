import { z } from "zod";
import { hasEnoughToMatch, matchJobs } from "@/lib/server/match";
import { jsonRoute } from "@/lib/server/route";
import { profileSchema } from "@/lib/types";

export const POST = jsonRoute("match", z.object({ profile: profileSchema }), async ({ profile }) => {
  if (!hasEnoughToMatch(profile)) return { jobs: [], roles: [], needsProfile: true };
  return { ...(await matchJobs(profile)), needsProfile: false };
}, 15);
