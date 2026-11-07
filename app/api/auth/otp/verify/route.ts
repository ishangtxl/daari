/**
 * POST /api/auth/otp/verify
 * Body: { otpToken: string; code: string }
 *
 * Verifies the OTP code against the signed token produced by /api/auth/otp/send.
 * On success, sets an HttpOnly session cookie and returns the session payload.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtpToken, createSessionToken, setSessionCookie } from "@/lib/auth";

const bodySchema = z.object({
  otpToken: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/),
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

  const { otpToken, code } = parsed.data;
  const result = await verifyOtpToken(otpToken, code);

  if (!result.ok) {
    // wrong_otp  → 401 so the client can ask the user to re-enter
    // expired_token → 410 so the client can re-send
    const status = result.error === "expired_token" ? 410 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  const sessionToken = await createSessionToken({ sub: result.phone, provider: "phone" });
  await setSessionCookie(sessionToken);

  return NextResponse.json({ ok: true, user: { phone: result.phone, provider: "phone" } });
}
