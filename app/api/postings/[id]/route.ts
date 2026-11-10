import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";
import { fail } from "@/lib/server/route";

/**
 * A job posted on Daari as a job seeker sees it, with their own application if they sent one.
 * Works for a link someone shared, even when the job is not in their matches.
 */
export const GET = accountRoute("posting-public", null, (_input, account, _data, { id }) => {
  const store = postings();
  const found = store.job(id);
  if (!found) return fail("not_found", 404);
  const { description: _description, ...job } = found.job;
  return { job, state: found.state, own: found.ownerId === account.id, application: store.applicationOf(account.id, id) };
}, 120);
