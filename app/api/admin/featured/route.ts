import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { setFeatured } from "@/lib/server/jobs-store";
import { fail } from "@/lib/server/route";

const bodySchema = z.object({ id: z.string().min(1).max(120), featured: z.boolean(), days: z.number().int().min(1).max(365).optional() });

function secretMatches(given: string | null): boolean {
  const secret = process.env.ADMIN_SECRET;
  // With no secret configured the route is closed to everyone.
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Daari team only: mark any listing featured, or remove it.
 *   curl -X POST /api/admin/featured -H "x-admin-secret: $ADMIN_SECRET" -d '{"id":"job_shop_...","featured":true}'
 */
export async function POST(req: NextRequest) {
  if (!secretMatches(req.headers.get("x-admin-secret"))) return fail("forbidden", 403);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("bad_request", 400);
  if (!setFeatured(parsed.data.id, parsed.data.featured, parsed.data.days)) return fail("not_found", 404);
  return NextResponse.json({ ok: true });
}
