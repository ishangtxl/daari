import type { MatchedJob } from "../types";

type JobArea = Pick<MatchedJob, "id" | "area">;
type RouteMatrixElement = {
  destinationIndex?: number;
  distanceMeters?: number;
  condition?: string;
  status?: { code?: number; message?: string };
};

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export function routesConfigured() {
  return Boolean(process.env.GOOGLE_ROUTES_API_KEY);
}

function normalizedArea(area: string) {
  return area.trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
}

function bengaluruAddress(area: string) {
  return `${area.trim()}, Bengaluru, Karnataka, India`;
}

/**
 * Maps the provider's destination indexes back to locality strings.
 * The API can return matrix elements in any order, so never assume response order.
 */
export function mapMatrixDistances(areas: string[], elements: RouteMatrixElement[]) {
  const byArea = new Map<string, number | null>();
  for (const [index, area] of areas.entries()) byArea.set(normalizedArea(area), null);
  for (const element of elements) {
    const area = areas[element.destinationIndex ?? -1];
    if (!area) continue;
    const distance = element.condition === "ROUTE_EXISTS" && Number.isFinite(element.distanceMeters)
      ? element.distanceMeters! / 1000
      : null;
    byArea.set(normalizedArea(area), distance);
  }
  return byArea;
}

/**
 * Fetch road distances only when a user asks for distance filtering/sorting.
 * Routes API accepts the neighbourhood names directly and resolves them internally;
 * its returned route distances are used as-is (not recomputed or persisted locally).
 */
export async function jobRoadDistances(homeArea: string, jobs: JobArea[]): Promise<Record<string, number | null>> {
  const key = process.env.GOOGLE_ROUTES_API_KEY;
  if (!key || !homeArea.trim() || !jobs.length) return {};

  const areaByKey = new Map<string, string>();
  for (const job of jobs) {
    const area = job.area.trim();
    const normalized = normalizedArea(area);
    if (normalized && !areaByKey.has(normalized)) areaByKey.set(normalized, area);
  }
  const areas = [...areaByKey.values()];
  if (!areas.length) return {};

  const response = await fetch(ROUTE_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "destinationIndex,distanceMeters,condition,status",
    },
    body: JSON.stringify({
      origins: [{ waypoint: { address: bengaluruAddress(homeArea) } }],
      destinations: areas.map((area) => ({ waypoint: { address: bengaluruAddress(area) } })),
      travelMode: "DRIVE",
      regionCode: "IN",
    }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    console.warn(`[routes] Google returned HTTP ${response.status}: ${message.slice(0, 300)}`);
    throw new Error("Could not calculate nearby job distances");
  }

  const elements = await response.json() as RouteMatrixElement[];
  if (!Array.isArray(elements)) throw new Error("Google returned an invalid route matrix");

  const byArea = mapMatrixDistances(areas, elements);
  const result: Record<string, number | null> = {};
  for (const job of jobs) {
    result[job.id] = byArea.get(normalizedArea(job.area)) ?? null;
  }
  return result;
}
