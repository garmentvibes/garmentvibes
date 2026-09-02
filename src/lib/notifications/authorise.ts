import { timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Who may run a dispatch pass.
//
// Deliberately separate from the route, and deliberately free of `server-only`
// and of `process.env`: this is the check that decides whether a stranger can
// drain the outbox, and a check that cannot be unit-tested is a check nobody
// finds out about until it is wrong in production. Both failure directions are
// expensive — a locked-out scheduler means nothing is ever delivered, and an
// open endpoint means anybody can burn attempts and provider quota.
//
// ---------------------------------------------------------------------------
// Why two secrets
// ---------------------------------------------------------------------------
//
// Vercel names the secret for its own crons. It injects
// `Authorization: Bearer $CRON_SECRET` into every scheduled request and offers
// no way to send a different header, so a deployment there cannot use a name of
// our choosing. NOTIFICATIONS_DISPATCH_SECRET remains for the callers we do
// control: a pass run by hand against a stuck queue, or a scheduler somewhere
// else later.
//
// Either is sufficient on its own, and setting both does not oblige them to
// match — which is the trap a first-one-wins check would have set, where the
// cron 401s because the other variable happened to be defined too.
// ---------------------------------------------------------------------------

/** Strips the `Bearer ` prefix, if the caller sent one. */
export function offeredToken(header: string | null): string {
  const value = header ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : value;
}

/**
 * Whether an offered token matches any of the configured secrets.
 *
 * With no secrets configured this is false for every token, including the empty
 * one — the route turns that into a 503 rather than a 401, but the answer here
 * is the same either way, and it is the safe one. An unset variable is far more
 * likely to be a deployment that forgot than a deployment that meant "anyone
 * may drain the outbox".
 */
export function tokenAccepted(offered: string, secrets: readonly string[]): boolean {
  const a = Buffer.from(offered);

  // Every secret is compared even after one has matched. Returning early would
  // make the response time depend on which secret was offered, and not
  // answering questions like that is the entire purpose of timingSafeEqual.
  return secrets.reduce<boolean>((matched, secret) => {
    const b = Buffer.from(secret);
    // timingSafeEqual throws on a length mismatch, which would itself leak the
    // length. Compare the lengths separately and always run the comparison.
    const equal = a.length === b.length && timingSafeEqual(a, b);
    return equal || matched;
  }, false);
}
