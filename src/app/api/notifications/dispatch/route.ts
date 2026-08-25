import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

// The endpoint a scheduler calls to drain the outbox.
//
// One pass per request: claim a batch, send it, settle it, answer with what
// happened. It does not loop until the queue is empty, because a serverless
// function has a wall-clock limit and a pass that gets killed halfway leaves
// messages claimed. Claims expire — `claim_notifications` reclaims anything
// held longer than five minutes — so the recovery is automatic, but it costs
// those messages five minutes and one of their five attempts. A short pass on
// a frequent schedule pays neither.
//
// ---------------------------------------------------------------------------
// Why this is not a cron export
// ---------------------------------------------------------------------------
//
// Vercel's scheduler drives an HTTP endpoint, so a route is what it needs, and
// keeping it a route means the same pass can be triggered by hand while
// debugging a stuck queue. The schedule itself is deployment configuration —
// see the note in .env.example — rather than something checked in, since the
// project is not on Vercel yet and inventing a vercel.json now would be
// guessing at a deployment nobody has made.
//
// ---------------------------------------------------------------------------
// Why it is a shared secret and not a session
// ---------------------------------------------------------------------------
//
// There is no user behind a scheduled run, so there is no session to check.
// Leaving it open is not an option either: an unauthenticated caller could
// hammer it, and while the database would stop them sending anything twice,
// each request still burns attempts and provider quota. So the caller proves
// it is the scheduler with a secret, compared in constant time.
//
// With no secret configured the route answers 503 and does nothing. That is
// deliberately fail-closed: an unset variable is far more likely to be a
// deployment that forgot than a deployment that meant "anyone may drain the
// outbox".

/** How many messages one pass handles. See the wall-clock note above. */
const BATCH = 20;

function authorised(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const offered = header.startsWith("Bearer ") ? header.slice(7) : header;

  const a = Buffer.from(offered);
  const b = Buffer.from(secret);

  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Compare the lengths separately and always run the comparison.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.NOTIFICATIONS_DISPATCH_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (!authorised(request, secret)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const summary = await dispatchNotifications(BATCH);

  // 200 even when every send failed. The failures are recorded on the rows
  // themselves and visible in the admin panel; answering non-2xx would tell
  // the scheduler to retry a batch that has already been attempted and, for
  // anything that did go out, already delivered.
  return NextResponse.json(summary);
}
