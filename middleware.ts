/**
 * Next.js Edge Middleware — auth guard.
 *
 * Public paths (no sign-in required):
 *   /login          — the sign-in page itself
 *   /api/auth/**    — all auth API routes
 *   /_next/**       — Next.js static assets
 *   /favicon.ico    — browser favicon request
 *
 * Everything else requires a valid session cookie.
 * Unauthenticated requests to non-API paths are redirected to /login.
 * Unauthenticated requests to protected API paths receive a 401 JSON response.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE } from "@/lib/auth";

// Paths that never require authentication.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",   // covers /api/auth/firebase, /api/auth/otp/*, /api/auth/oauth/*, etc.
  "/_next/",
  "/favicon.ico",
];

export const config = {
  // Run on every path; the matcher below avoids static file directories.
  matcher: ["/((?!_next/static|_next/image|icons|images).*)"],
};

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) return new TextEncoder().encode("dev-secret-change-me");
  return new TextEncoder().encode(raw);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await jwtVerify(token, getSecret());
      return NextResponse.next();
    } catch {
      // Token present but invalid/expired — fall through to redirect.
    }
  }

  // API routes return JSON; pages get a redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}
