import { NextResponse } from "next/server";
import { MAX_OPEN_POSTINGS, OTHER_WORK, screenVerdict, type PostingForm } from "../postings";
import { buildPosting, pickPostingRole, postingText, screenPosting } from "./hiring";
import { postings } from "./postings";
import { fail } from "./route";

const same = (a: string, b: string) => a.trim().toLocaleLowerCase("en-IN") === b.trim().toLocaleLowerCase("en-IN");

/**
 * Puts a posting up, or replaces an existing one. Jev screens the final text, as the employer
 * left it, so a fee added after the draft was checked is still caught.
 */
export async function publish(ownerId: string, form: PostingForm, existingId?: string) {
  const store = postings();
  const mine = store.mine(ownerId);
  if (existingId && !mine.some((posting) => posting.id === existingId)) return fail("not_found", 404);
  const open = mine.filter((posting) => posting.state === "open" && posting.id !== existingId);
  if (!existingId && open.length >= MAX_OPEN_POSTINGS) return fail("too_many_postings", 409);
  if (open.some((posting) => same(posting.body.form.title, form.title) && same(posting.body.form.area, form.area))) {
    return fail("duplicate_posting", 409);
  }

  // Work typed in by hand is matched on the nearest listed kind, so the right people still see it.
  const [signals, matchRole] = await Promise.all([
    screenPosting(postingText(form)),
    form.roleId === OTHER_WORK ? pickPostingRole(`${form.workType}. ${form.title}. ${form.summary}`) : Promise.resolve(form.roleId),
  ]);
  const { blocked, cautions } = screenVerdict(signals);
  if (blocked.length) return NextResponse.json({ error: "posting_blocked", blocked }, { status: 422 });

  const body = { ...(await buildPosting(form, signals)), matchRole };
  if (existingId) {
    store.update(ownerId, existingId, body);
    return { id: existingId, cautions };
  }
  return { id: store.create(ownerId, body), cautions };
}
