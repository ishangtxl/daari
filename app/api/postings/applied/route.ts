import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";

/** Where each application sent through Daari stands, by posting id. */
export const GET = accountRoute("postings-applied", null, (_input, account) => ({ applications: postings().applicationsBy(account.id) }), 60);
