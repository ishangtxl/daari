/**
 * Signed session cookies. Phone sign-in (Firebase) and Google sign-in both end by writing the same
 * HttpOnly cookie, `daari_session`, which the proxy checks on every request.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "daari_session";
// Only tokens made for sessions are accepted as sessions, even if another token shares the secret.
const AUDIENCE = "daari-session";
const SESSION_TTL = Number(process.env.SESSION_TTL_SECONDS ?? 2592000); // 30 days

type SessionClaims = {
  sub: string; // phone number or Google subject ID
  name?: string;
  provider: "phone" | "google";
};

export type SessionPayload = JWTPayload & SessionClaims;

/** Null when AUTH_SECRET is missing or short, so every check fails closed instead of using a default. */
function authSecret(): Uint8Array | null {
  const raw = process.env.AUTH_SECRET;
  return raw && raw.length >= 32 ? new TextEncoder().encode(raw) : null;
}

export async function createSessionToken(payload: SessionClaims): Promise<string> {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET must be set to at least 32 characters");
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const secret = authSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience: AUDIENCE, algorithms: ["HS256"] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** Read and verify the session cookie. Returns null if absent or invalid. */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

/** Write the session cookie (call from route handlers). */
export async function setSessionCookie(sessionToken: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
