/**
 * Everything needs a signed-in session except the sign-in page and the routes that sign you in.
 * Pages without a session go to /login, and API calls get a 401, so bots cannot spend API credits.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

// /api/admin/ has no session: it is closed unless the request carries the ADMIN_SECRET header, which the route checks itself.
const PUBLIC_PREFIXES = ["/login", "/api/auth/", "/api/admin/"];

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && (await verifySessionToken(token))) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  // After signing in, go back to where they were headed. Posting a job is for employers.
  if (pathname !== "/") {
    loginUrl.searchParams.set("redirect", pathname);
    if (pathname.startsWith("/jobs/post")) loginUrl.searchParams.set("intent", "employer");
  }
  return NextResponse.redirect(loginUrl);
}
