import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Demo admin sessions
//
// Read this before touching it, because it is the one path that grants staff
// access without a password check.
//
// The admin panel's *data* still lives in localStorage (see the store→table
// map in supabase/README.md), so the CI browser suite drives the whole panel
// without a database. Requiring a real Supabase Auth login to reach it would
// mean either standing up a Supabase project for CI or deleting that
// coverage. Neither is a good trade for a QA harness.
//
// So there is a demo path, with two hard constraints:
//
//   1. It is IGNORED whenever Supabase is configured. Not "overridden" or
//      "lower priority" — demoAdminEnabled() returns false outright, so a
//      real deployment cannot be talked into it by setting an env var.
//   2. It must be asked for explicitly with ALLOW_DEMO_ADMIN=1. Absent that,
//      an unconfigured app has no admin access at all rather than an open one.
//
// The session itself is a signed, HttpOnly cookie set by a server action and
// read on the server. That is the part that matters even in demo mode: the
// old gate was a localStorage flag read by a client component, so "am I
// staff?" was a question the browser answered about itself. Now it is a
// question the server answers, in both modes.
// ---------------------------------------------------------------------------

export const DEMO_COOKIE = "gv_demo_admin";

// A demo session is worth about as much as the mock data behind it, so an
// eight-hour working day is the right order of magnitude.
export const DEMO_SESSION_MAX_AGE = 60 * 60 * 8;

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * True only when there is no Supabase project AND demo access was explicitly
 * requested. Both halves are load-bearing — see the header comment.
 */
export function demoAdminEnabled(): boolean {
  if (supabaseConfigured()) return false;
  return process.env.ALLOW_DEMO_ADMIN === "1";
}

// Signing key. A deployment that means to use demo mode across restarts or
// across more than one instance sets DEMO_ADMIN_SECRET; otherwise every
// process invents its own, which invalidates demo sessions on restart. That
// is the correct default: a forgotten env var should log people out, not
// leave a well-known key in place.
let ephemeralSecret: Buffer | null = null;

function signingKey(): Buffer {
  const configured = process.env.DEMO_ADMIN_SECRET;
  if (configured) return Buffer.from(configured, "utf8");
  if (!ephemeralSecret) ephemeralSecret = randomBytes(32);
  return ephemeralSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

/**
 * Encodes an email and an expiry into `<payload>.<hmac>`. Without the signing
 * key the payload can be read but not changed, which is all this needs to be:
 * it carries no secret, it only has to be unforgeable.
 */
export function signDemoSession(email: string, now = Date.now()): string {
  const expiresAt = now + DEMO_SESSION_MAX_AGE * 1000;
  const payload = Buffer.from(JSON.stringify({ email, expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Returns the email a demo cookie attests to, or null if it is malformed,
 * expired, or not signed by this process's key.
 */
export function verifyDemoSession(value: string | undefined, now = Date.now()): string | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = value.slice(0, separator);
  const provided = value.slice(separator + 1);
  const expected = sign(payload);

  // Compare via timingSafeEqual, which throws on a length mismatch — so the
  // lengths are checked first rather than letting that throw become the
  // signal.
  const providedBytes = Buffer.from(provided, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  if (providedBytes.length !== expectedBytes.length) return null;
  if (!timingSafeEqual(providedBytes, expectedBytes)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof decoded !== "object" || decoded === null) return null;
  const { email, expiresAt } = decoded as { email?: unknown; expiresAt?: unknown };
  if (typeof email !== "string" || !email) return null;
  if (typeof expiresAt !== "number" || now >= expiresAt) return null;

  return email;
}

/** Test seam: forget the process-lifetime key so a test can prove rotation. */
export function resetEphemeralSecretForTests(): void {
  ephemeralSecret = null;
}
