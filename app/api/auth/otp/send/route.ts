/**
 * POST /api/auth/otp/send
 * Body: { phone: string }   — Indian mobile number, e.g. "9876543210" or "+919876543210"
 *
 * SMS provider priority (first one configured wins):
 *   1. Twilio       — set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
 *   2. Fast2SMS     — set FAST2SMS_API_KEY (requires DLT registration for production)
 *   3. Dev/demo     — no env vars set → OTP is returned in the response body so you
 *                     can test the full login flow without any SMS provider.
 *                     NEVER enabled in NODE_ENV=production.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createOtpToken } from "@/lib/auth";

const bodySchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .transform((v) => v.replace(/\D/g, "")) // strip spaces, dashes, +91 prefix
    .refine((v) => /^[6-9]\d{9}$/.test(v), { message: "Enter a valid 10-digit Indian mobile number" }),
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
    return NextResponse.json({ error: "invalid_phone", details: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  const phone = parsed.data.phone;
  const { code, token: otpToken } = await createOtpToken(phone);
  const expiresIn = Number(process.env.OTP_TTL_SECONDS ?? 300);
  const isProd = process.env.NODE_ENV === "production";

  // ── 1. Twilio ──────────────────────────────────────────────────────────────
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_FROM_NUMBER;

  if (twilioSid && twilioToken && twilioFrom) {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: `+91${phone}`,
          From: twilioFrom,
          Body: `Your Daari OTP is ${code}. Valid for ${Math.round(expiresIn / 60)} minutes.`,
        }),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[auth/otp/send] Twilio error", err);
      return NextResponse.json({ error: "sms_failed" }, { status: 502 });
    }
    return NextResponse.json({ otpToken, expiresIn });
  }

  // ── 2. Fast2SMS (requires DLT registration) ────────────────────────────────
  const fast2smsKey = process.env.FAST2SMS_API_KEY;

  if (fast2smsKey) {
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: fast2smsKey, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "otp", variables_values: code, numbers: phone }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[auth/otp/send] Fast2SMS error", err);
      if (isProd) {
        return NextResponse.json({ error: "sms_failed" }, { status: 502 });
      }
      // In development mode, fall through to dev demo OTP so testing never breaks.
    } else {
      return NextResponse.json({ otpToken, expiresIn });
    }
  }

  // ── 3. Dev / demo mode ─────────────────────────────────────────────────────
  if (isProd) {
    // In production with no SMS provider configured, fail loudly.
    console.error("[auth/otp/send] No SMS provider configured. Set TWILIO_* or FAST2SMS_API_KEY.");
    return NextResponse.json({ error: "sms_not_configured" }, { status: 503 });
  }

  // Development: return the OTP in the response so the UI can pre-fill it.
  console.warn(`[auth/otp/send] DEV MODE — OTP for ${phone}: ${code}`);
  return NextResponse.json({ otpToken, expiresIn, devOtp: code });
}
