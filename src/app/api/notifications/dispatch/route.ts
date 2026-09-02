import { NextResponse } from "next/server";
import { offeredToken, tokenAccepted } from "@/lib/notifications/authorise";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

// The endpoint the scheduled sweep calls to drain the outbox.
//
// One pass per request: claim a batch, send it, settle it, answer with what
// happened. It does not loop until the queue is empty, because a serverless
// function has a wall-clock limit and a pass that gets killed halfway leaves
// messages claimed. Claims expire — `claim_notifications` reclaims anything
// held longer than five minutes — so the recovery is automatic, but it costs
// those messages five minutes and one of their five attempts.
//
// ---------------------------------------------------------------------------
// What this endpoint is for, now that it is not the delivery mechanism
// ---------------------------------------------------------------------------
//
// It used to be the only thing that sent anything, which made its schedule the
// customer's wait. On the Hobby plan that schedule is once a day, so it is not
// that any more: messages are sent from the request that queues them, by the
// `after` pass in lib/notifications/dispatch.ts. What arrives here is the
// sweep — the messages whose inline pass failed, was killed, or never ran.
//
// It is still a route rather than a cron export, because Vercel's scheduler
// drives an HTTP endpoint and because a route can also be called by hand while
// debugging a stuck queue. The schedule now lives in vercel.json next to it.
//
// ---------------------------------------------------------------------------
// Why it answers GET
// ---------------------------------------------------------------------------
//
// Because Vercel's scheduler only issues GET. A GET that mutates is a wart —
// this one claims rows, spends attempts and sends mail, none of which a GET is
// supposed to do — but the alternative is a second, differently-shaped path
// that exists only to be scheduled, and one endpoint with a documented wart is
// easier to reason about than two endpoints that must not drift apart. Both
// verbs run the identical pass. Nothing links to this URL and nothing
// prefetches it: it is reachable only with the secret.
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
// Two variables are accepted, and which token matches which is decided in
// lib/notifications/authorise.ts — see the reasoning there. With neither
// configured the route answers 503 and does nothing, which is deliberately
// fail-closed.

/** How many messages one pass handles. See the wall-clock note above. */
const BATCH = 20;

/** Every secret this deployment will accept, in no particular order. */
function configuredSecrets(): string[] {
  return [process.env.NOTIFICATIONS_DISPATCH_SECRET, process.env.CRON_SECRET].filter(
    (s): s is string => Boolean(s)
  );
}

async function runPass(request: Request) {
  const secrets = configuredSecrets();

  if (secrets.length === 0) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (!tokenAccepted(offeredToken(request.headers.get("authorization")), secrets)) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const summary = await dispatchNotifications(BATCH);

  // 200 even when every send failed. The failures are recorded on the rows
  // themselves and visible in the admin panel; answering non-2xx would tell
  // the scheduler to retry a batch that has already been attempted and, for
  // anything that did go out, already delivered.
  return NextResponse.json(summary);
}

/** The scheduled sweep. Vercel's cron issues GET; see the note above. */
export async function GET(request: Request) {
  return runPass(request);
}

/** The same pass, for callers that can choose their verb. */
export async function POST(request: Request) {
  return runPass(request);
}
