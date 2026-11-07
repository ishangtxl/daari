/**
 * POST /api/auth/firebase
 * Body: { idToken: string }
 *
 * The client calls this after Firebase Phone Auth succeeds.
 * We verify the Firebase ID token with the Admin SDK, then issue our own
 * HttpOnly session cookie (exactly the same cookie every other auth method uses).
 *
 * Flow:
 *   1. Client: RecaptchaVerifier + signInWithPhoneNumber → confirmationResult.confirm(code)
 *   2. Client: user.getIdToken() → POST /api/auth/firebase { idToken }
 *   3. Server: verifyFirebaseIdToken(idToken) → extract phone_number
 *   4. Server: createSessionToken + setSessionCookie
 *   5. Client: redirect to "/"
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyFirebaseIdToken } from "@/lib/server/firebase-admin";
import { createSessionToken, setSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  idToken: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 422 });
  }

  let decoded;
  try {
    decoded = await verifyFirebaseIdToken(parsed.data.idToken);
  } catch (err) {
    console.error("[auth/firebase] token verification failed", err);
    return NextResponse.json({ error: "invalid_id_token" }, { status: 401 });
  }

  // Firebase sets phone_number for phone-auth users.
  const phone = decoded.phone_number ?? decoded.uid;
  const sessionToken = await createSessionToken({ sub: phone, provider: "phone" });
  await setSessionCookie(sessionToken);

  return NextResponse.json({ ok: true, user: { phone, provider: "phone" } });
}
