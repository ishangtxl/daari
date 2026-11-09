import { accountRoute } from "@/lib/server/account";
import { newMessagesSchema } from "@/lib/state";

/** Adds new messages to the signed-in account's conversation. */
export const POST = accountRoute("state-messages", newMessagesSchema, ({ messages }, account, data) => {
  data.appendMessages(account.id, messages);
});
