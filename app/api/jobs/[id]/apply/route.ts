import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { applyToListing } from "@/lib/server/applicants";
import { currentAccount } from "@/lib/server/account";
import { store } from "@/lib/server/store";
import { fail, rateAllowed } from "@/lib/server/route";

/** A job seeker applies to a provider listing. Their profile is copied onto the application at this moment. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const [account, session] = await Promise.all([currentAccount(), getSession()]);
  if (!account || !session?.sub) return fail("signed_out", 401);
  if (!rateAllowed("listing-apply", req, 60)) return fail("too_many_requests", 429);
  const { id } = await params;
  try {
    store().touch(account);
    const result = applyToListing(id, account, session.sub, session.name);
    if (!result.ok) {
      const status = result.reason === "not_found" ? 404 : 409;
      return NextResponse.json({ ok: false, error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true, created: result.created });
  } catch (error) {
    console.error("[listing-apply]", error instanceof Error ? error.message : error);
    return fail("service_error", 500);
  }
}
