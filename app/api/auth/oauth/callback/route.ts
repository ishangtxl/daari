/**
 * GET /api/auth/oauth/callback
 *
 * Google redirects here after the user grants permission.
 * 1. Validate `state` against the cookie set in /api/auth/oauth/google.
 * 2. Exchange the `code` for an access token.
 * 3. Fetch the user's profile from Google.
 * 4. Issue a Daari session cookie and redirect to home.
 */

import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { safeNext } from "@/lib/postings";

// Behind the proxy, req.url carries the app's internal address (localhost:3111), so redirects
// use the public address from APP_BASE_URL when it is set.
const origin = (req: NextRequest) => process.env.APP_BASE_URL || req.url;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // User denied access.
  if (errorParam) {
    return NextResponse.redirect(new URL(`/login?error=oauth_denied`, origin(req)));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL(`/login?error=oauth_invalid`, origin(req)));
  }

  // Verify CSRF state.
  const jar = await cookies();
  const savedState = jar.get("oauth_state")?.value;
  jar.delete("oauth_state");

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL(`/login?error=oauth_state_mismatch`, origin(req)));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.redirect(new URL(`/login?error=oauth_not_configured`, origin(req)));
  }

  // Exchange code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("[auth/oauth/callback] token exchange failed", await tokenRes.text());
    return NextResponse.redirect(new URL(`/login?error=oauth_token_failed`, origin(req)));
  }

  const { access_token } = (await tokenRes.json()) as { access_token: string };

  // Fetch user info.
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!userRes.ok) {
    return NextResponse.redirect(new URL(`/login?error=oauth_userinfo_failed`, origin(req)));
  }

  const { sub, name, email } = (await userRes.json()) as { sub: string; name?: string; email?: string };

  const sessionToken = await createSessionToken({
    sub,
    name: name ?? email ?? "Google user",
    provider: "google",
  });
  await setSessionCookie(sessionToken);
  const next = safeNext(jar.get("oauth_next")?.value);
  jar.delete("oauth_next");

  return NextResponse.redirect(new URL(next, origin(req)));
}
