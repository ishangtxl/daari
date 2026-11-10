import { accountRoute } from "@/lib/server/account";
import { postings } from "@/lib/server/postings";

/** A short value that changes whenever Daari's own postings do, so saved matches know to refresh. */
export const GET = accountRoute("postings-version", null, () => ({ version: postings().version() }), 120);
