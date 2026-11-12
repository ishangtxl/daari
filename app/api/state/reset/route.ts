import { accountRoute } from "@/lib/server/account";

/** Starts over: forgets what Daari learned about the account, keeping the account and its language. */
export const POST = accountRoute("state-reset", null, (_input, account, data) => {
  data.reset(account.id);
}, 10);
