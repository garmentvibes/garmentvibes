import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth cookies and reports whether anyone is signed in.
 *
 * This has to happen in the proxy rather than in a layout: access tokens are
 * short-lived, and refreshing one means writing a new cookie, which a Server
 * Component cannot do. Without this the session quietly stops working partway
 * through a staff member's day.
 *
 * `user` here answers "is someone signed in", not "are they staff" — the role
 * check needs a database read and belongs in the data access layer, not on a
 * hot path that runs before every matched request.
 */
export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // No project configured. Pass the request through untouched and report
  // nobody signed in; src/lib/auth/dal.ts decides what that means.
  if (!supabaseUrl || !supabaseAnonKey) {
    return { response, user: null };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
