import { NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "../auth";
import { BudgetError } from "./llm";
import { fail, rateAllowed } from "./route";
import { store, type Account, type Store } from "./store";

const MAX_BODY_CHARS = 1_000_000;

/**
 * The signed-in account, from the session cookie. Phone and Google ids are prefixed by provider, so
 * the two kinds of id can never collide.
 */
export async function currentAccount(): Promise<Account | null> {
  const session = await getSession();
  if (!session?.sub || (session.provider !== "phone" && session.provider !== "google")) return null;
  return { id: `${session.provider}:${session.sub}`, provider: session.provider };
}

/**
 * A route that works on the signed-in account's own data. The proxy already turns away visitors who
 * are not signed in, and this checks again, so a route can never run without an account.
 */
export function accountRoute<S extends z.ZodType | null>(
  name: string,
  schema: S,
  handler: (input: S extends z.ZodType ? z.output<S> : null, account: Account, data: Store, params: Record<string, string>) => unknown,
  limit = 120,
) {
  return async (req: Request, context?: { params: Promise<Record<string, string>> }) => {
    const account = await currentAccount();
    if (!account) return fail("signed_out", 401);
    if (!rateAllowed(name, req, limit)) return fail("too_many_requests", 429);
    let input: unknown = null;
    if (schema) {
      const body = await req.text();
      if (body.length > MAX_BODY_CHARS) return fail("too_large", 413);
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        return fail("bad_request", 400);
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) return fail("bad_request", 400);
      input = parsed.data;
    }
    try {
      const data = store();
      data.touch(account);
      const result = await handler(input as never, account, data, (await context?.params) ?? {});
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof BudgetError) return fail("over_budget", 503);
      // Never log the request body: it holds what the person said about themselves.
      console.error(`[${name}]`, error instanceof Error ? error.message : error);
      return fail("service_error", 500);
    }
  };
}
