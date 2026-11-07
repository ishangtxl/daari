/**
 * GET /api/auth/session
 * Returns the current session payload, or 401 if not logged in.
 * Used by the client to hydrate auth state on mount.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: session.sub, name: session.name ?? null, provider: session.provider },
  });
}
