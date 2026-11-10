import { z } from "zod";
import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";
import { fail } from "@/lib/server/route";
import { REPORT_REASONS } from "@/lib/postings";

export const POST = accountRoute("posting-report", z.object({ reason: z.enum(REPORT_REASONS) }), ({ reason }, account, _data, { id }) => {
  if (!postings().report(account.id, id, reason)) return fail("not_found", 404);
  console.log(`[posting-report] ${id} ${reason}`);
}, 10);
