import { NextResponse, type NextRequest } from "next/server";

import { refreshSession } from "@/lib/supabase/proxy";
import { DEMO_COOKIE } from "@/lib/auth/demo";

// ---------------------------------------------------------------------------
// proxy.ts, not middleware.ts — Next.js 16 deprecated the middleware file
// convention and renamed it, function and all.
//
// This does two jobs, and it is worth being precise about which is which:
//
//   1. Refreshing Supabase's auth cookies. This is the job that has to happen
//      here. Access tokens are short-lived and refreshing one writes a
//      cookie, which a Server Component cannot do.
//
//   2. Bouncing obviously-signed-out traffic away from /admin. This is a
//      convenience, not a security control, and it deliberately does not try
//      to be one. It checks for the presence of a session, never its
//      validity, because a forged cookie is caught a layer down.
//
// The real gate is requireStaff() in src/lib/auth/dal.ts, called from the
// admin layout. Next's own proxy documentation is explicit about why: a
// matcher does not reliably cover Server Functions, so "moved an action to
// another route" or "edited the matcher" can silently remove proxy coverage
// from a mutation. Authorisation belongs where the work happens.
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { response, user } = await refreshSession(request);

  const { pathname } = request.nextUrl;

  // The login page is the destination of the redirect below; sending it to
  // itself would loop.
  if (pathname === "/admin/login") return response;

  const hasSession = Boolean(user) || request.cookies.has(DEMO_COOKIE);
  if (!hasSession) {
    const login = new URL("/admin/login", request.url);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Scoped to /admin because that is the only area with a real authorisation
  // boundary today — the storefront's session is still the mocked zustand
  // store (see the store→table map in supabase/README.md). Widen this when
  // customer auth becomes real, and note that doing so puts a getUser() round
  // trip in front of every catalogue request.
  matcher: ["/admin/:path*"],
};
