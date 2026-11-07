/**
 * POST /api/auth/signout
 * Clears the session cookie and returns 200.
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
