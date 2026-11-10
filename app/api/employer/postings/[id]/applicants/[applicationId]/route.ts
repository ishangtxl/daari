import { z } from "zod";
import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";
import { fail } from "@/lib/server/route";
import { APPLICANT_STATUSES } from "@/lib/postings";

/** The employer's answer to one applicant, which the applicant then sees on their side. */
export const PATCH = accountRoute("applicant-status", z.object({ status: z.enum(APPLICANT_STATUSES) }), ({ status }, account, _data, { id, applicationId }) => {
  return postings().setApplicantStatus(account.id, id, applicationId, status) ? { ok: true } : fail("not_found", 404);
}, 60);
