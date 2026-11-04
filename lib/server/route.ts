import { NextResponse } from "next/server";
import type { z } from "zod";
import { BudgetError } from "./llm";

// These routes spend real money, so cap each address. In memory, so this is per server instance.
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

/** Counted per route, because one session normally makes many calls across different features. */
export function rateAllowed(route: string, req: Request, limit: number) {
  const key = `${route}:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
  const now = Date.now();
  const hit = hits.get(key);
  if (!hit || hit.resetAt < now) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  hit.count++;
  return hit.count <= limit;
}

export function fail(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export function handleError(where: string, error: unknown) {
  if (error instanceof BudgetError) return fail("over_budget", 503);
  console.error(`[${where}]`, error);
  return fail("service_error", 502);
}

/** A JSON POST route with rate limiting, input validation and consistent errors. */
export function jsonRoute<S extends z.ZodType>(
  name: string,
  schema: S,
  handler: (input: z.output<S>, req: Request) => Promise<Response | object>,
  limit = 30,
) {
  return async (req: Request) => {
    if (!rateAllowed(name, req, limit)) return fail("too_many_requests", 429);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("bad_request", 400);
    try {
      const result = await handler(parsed.data, req);
      return result instanceof Response ? result : NextResponse.json(result);
    } catch (error) {
      return handleError(name, error);
    }
  };
}
