import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";
import { publish } from "@/lib/server/publish";
import { postingFormSchema } from "@/lib/postings";

/** The signed-in employer's postings, newest first, with how many people applied. */
export const GET = accountRoute("postings-mine", null, (_input, account) => ({ postings: postings().mine(account.id) }), 60);

export const POST = accountRoute("posting-publish", postingFormSchema, (form, account) => publish(account.id, form), 10);
