import { accountRoute } from "@/lib/server/account";
import { statePatchSchema } from "@/lib/state";

/** Everything saved for the signed-in account, to start the app with on any device. */
export const GET = accountRoute("state-load", null, (_input, account, data) => data.load(account.id), 60);

/** Saves the parts of the account that changed. */
export const PATCH = accountRoute("state-save", statePatchSchema, (patch, account, data) => {
  data.save(account.id, patch);
});

/** Deletes the account's data for good. */
export const DELETE = accountRoute("state-delete", null, (_input, account, data) => {
  data.remove(account.id);
}, 10);
