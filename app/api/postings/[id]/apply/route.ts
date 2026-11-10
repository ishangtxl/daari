import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";
import { fail } from "@/lib/server/route";
import { applicantCardSchema } from "@/lib/postings";

const REFUSED: Record<string, [string, number]> = { missing: ["not_found", 404], closed: ["posting_closed", 409], own: ["own_posting", 409], duplicate: ["already_applied", 409] };

/** Sends the card the person agreed to share to the employer, and to nobody else. */
export const POST = accountRoute("posting-apply", applicantCardSchema, (card, account, _data, { id }) => {
  const store = postings();
  const found = store.job(id);
  if (!found) return fail("not_found", 404);
  // Every requirement gets the person's own yes or no, so the employer never reads a guess.
  const ids = found.job.requirements.map((req) => req.id);
  if (ids.some((reqId) => typeof card.answers[reqId] !== "boolean")) return fail("bad_request", 400);
  const answers = Object.fromEntries(ids.map((reqId) => [reqId, card.answers[reqId]]));
  const result = store.apply(account.id, id, { ...card, answers });
  if (result !== "ok") return fail(REFUSED[result][0], REFUSED[result][1]);
  return { application: store.applicationOf(account.id, id) };
}, 20);

/** Takes the application back. The employer no longer sees any of it. */
export const DELETE = accountRoute("posting-withdraw", null, (_input, account, _data, { id }) => {
  postings().withdraw(account.id, id);
}, 20);
