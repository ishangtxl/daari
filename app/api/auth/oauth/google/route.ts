/**
 * GET /api/auth/oauth/google
 *
 * Redirects the browser to Google's OAuth2 authorisation endpoint.
 * A `state` parameter (CSRF token) is embedded in the redirect URL and also
 * placed in a short-lived HttpOnly cookie so the callback can verify it.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleSignInEnabled } from "@/lib/auth";

const SCOPES = ["openid", "email", "profile"].join(" ");

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!googleSignInEnabled() || !clientId || !redirectUri) {
    return NextResponse.json({ error: "google_oauth_not_configured" }, { status: 503 });
  }

  // A random state value prevents CSRF attacks on the callback.
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600, // 10 minutes — enough to complete the Google login
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state,
    access_type: "online",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
