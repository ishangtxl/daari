/**
 * Auth helpers — JWT-backed OTP tokens and session cookies.
 *
 * OTP flow:   POST /api/auth/otp/send  →  POST /api/auth/otp/verify
 * OAuth flow: GET  /api/auth/oauth/google  →  GET /api/auth/oauth/callback
 *
 * Both flows end by writing a signed, HttpOnly session cookie called `daari_session`.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

// ── Constants ────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "daari_session";
const OTP_TTL = Number(process.env.OTP_TTL_SECONDS ?? 300);           // 5 min
const SESSION_TTL = Number(process.env.SESSION_TTL_SECONDS ?? 2592000); // 30 days

// ── Secret ───────────────────────────────────────────────────────────────────

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET env var is not set");
  return new TextEncoder().encode(raw);
}

// ── OTP token (short-lived, carries the phone number) ───────────────────────

export interface OtpPayload extends JWTPayload {
  phone: string;
  otp: string;         // hashed with SHA-256
}

/** Create a 6-digit OTP and return both the plaintext code and a signed JWT. */
export async function createOtpToken(phone: string): Promise<{ code: string; token: string }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await sha256(code);
  const token = await new SignJWT({ phone, otp: hash } satisfies Partial<OtpPayload>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${OTP_TTL}s`)
    .sign(getSecret());
  return { code, token };
}

/** Verify an OTP token and check that the supplied code matches. */
export async function verifyOtpToken(
  token: string,
  code: string,
): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const p = payload as OtpPayload;
    if (!p.phone || !p.otp) return { ok: false, error: "invalid_token" };
    const hash = await sha256(code.trim());
    if (hash !== p.otp) return { ok: false, error: "wrong_otp" };
    return { ok: true, phone: p.phone };
  } catch {
    return { ok: false, error: "expired_token" };
  }
}

// ── Session token (long-lived, written into an HttpOnly cookie) ──────────────

export interface SessionPayload extends JWTPayload {
  sub: string;         // phone number or Google subject ID
  name?: string;
  provider: "phone" | "google";
}

export async function createSessionToken(payload: Omit<SessionPayload, keyof JWTPayload>): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Read and verify the session cookie. Returns null if absent or invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Write the session cookie (call from API route handlers, not middleware). */
export async function setSessionCookie(sessionToken: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

/** Clear the session cookie. */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

// ── Utility ──────────────────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
