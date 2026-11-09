import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { applicantsForPoster } from "@/lib/server/applicants";
import { fail } from "@/lib/server/route";

/** Every listing of the signed-in provider, with who applied. */
export async function GET() {
  const session = await getSession();
  if (!session?.sub) return fail("signed_out", 401);
  try {
    return NextResponse.json({ ok: true, listings: applicantsForPoster(session.sub) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[provider-applicants]", error instanceof Error ? error.message : error);
    return fail("service_error", 500);
  }
}
