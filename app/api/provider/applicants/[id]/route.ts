import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { setApplicantStatus } from "@/lib/server/applicants";
import { fail } from "@/lib/server/route";
import { APPLICANT_STATUSES } from "@/lib/types";

const bodySchema = z.object({ status: z.enum(APPLICANT_STATUSES) });

/** The provider moves an applicant to new / shortlisted / rejected / hired. Only their own listings' applicants can be changed. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.sub) return fail("signed_out", 401);
  const { id } = await params;
  const applicationId = Number(id);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(applicationId) || !parsed.success) return fail("bad_request", 400);
  try {
    if (!setApplicantStatus(applicationId, session.sub, parsed.data.status)) return fail("not_found", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[provider-applicant-status]", error instanceof Error ? error.message : error);
    return fail("service_error", 500);
  }
}
