import { z } from "zod";
import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";
import { publish } from "@/lib/server/publish";
import { fail } from "@/lib/server/route";
import { postingFormSchema } from "@/lib/postings";

/** One posting with everyone who applied. Only the employer who posted it gets an answer. */
export const GET = accountRoute("posting-owner", null, (_input, account, _data, { id }) => {
  const posting = postings().forOwner(account.id, id);
  return posting ? { posting } : fail("not_found", 404);
}, 60);

/** Changes what the posting says. It is screened and translated again. */
export const PUT = accountRoute("posting-edit", postingFormSchema, (form, account, _data, { id }) => publish(account.id, form, id), 10);

/** Closes the posting, or opens it again for another 30 days. */
export const PATCH = accountRoute("posting-open", z.object({ open: z.boolean() }), ({ open }, account, _data, { id }) => {
  return postings().setOpen(account.id, id, open) ? { ok: true } : fail("not_found", 404);
}, 30);
