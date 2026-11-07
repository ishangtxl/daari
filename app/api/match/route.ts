import { z } from "zod";
import { hasEnoughToMatch, matchJobs } from "@/lib/server/match";
import { jsonRoute } from "@/lib/server/route";
import { routesConfigured } from "@/lib/server/routes";
import { profileSchema } from "@/lib/types";

export const POST = jsonRoute("match", z.object({ profile: profileSchema }), async ({ profile }) => {
  if (!hasEnoughToMatch(profile)) return { jobs: [], roles: [], needsProfile: true };
  const matched = await matchJobs(profile);
  return { ...matched, needsProfile: false, distanceEnabled: routesConfigured() };
}, 15);
