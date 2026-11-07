import { NextResponse } from "next/server";
import { z } from "zod";
import { jobRoadDistances, routesConfigured } from "@/lib/server/routes";
import { jsonRoute } from "@/lib/server/route";

const requestSchema = z.object({
  area: z.string().trim().min(1).max(120),
  jobs: z.array(z.object({ id: z.string().min(1).max(120), area: z.string().max(120) })).min(1).max(24),
});

export const POST = jsonRoute("job-distances", requestSchema, async ({ area, jobs }) => ({
  distances: await jobRoadDistances(area, jobs),
}), 12);

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { available: routesConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
