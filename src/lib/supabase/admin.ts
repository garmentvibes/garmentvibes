import "server-only";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// The service-role client.
//
// This key bypasses RLS entirely. It can read and write every row in every
// table for every customer, so:
//
//   * `server-only` above makes importing this from a client component a build
//     error rather than a leak discovered in production.
//   * The variable has no `NEXT_PUBLIC_` prefix and must never gain one —
//     that would inline it into the browser bundle along with the ability to
//     read every order in the shop.
//
// It exists for exactly one job: the Razorpay callbacks. A webhook arrives
// from Razorpay's infrastructure with no user session to act as, and marking
// an order paid is deliberately not something `authenticated` may do — see
// the grants in 0014. Everything a customer does goes through
// `src/lib/supabase/server.ts` as themselves, with RLS on.
// ---------------------------------------------------------------------------

/** True when the service role key is configured on this deployment. */
export function serviceRoleConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * A Supabase client that bypasses RLS. Null when not configured, so callers
 * degrade rather than throwing on a deployment without keys.
 *
 * No session persistence and no token refresh: this is a stateless server
 * client with a fixed key, and letting it try to store a session would mean
 * one request's auth state leaking into the next.
 */
export function createAdminClient() {
  if (!serviceRoleConfigured()) return null;

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Records a gateway payment against the order that carries this receipt.
 *
 * Returns the order id, or null when there is nothing to record against — no
 * Supabase configured, or no order with that reference. Both callers (the
 * browser's verify handoff and Razorpay's webhook) treat a null as "carry on":
 * the webhook must answer 2xx regardless so Razorpay does not retry into a
 * storm, and the customer must reach their confirmation page either way.
 *
 * Safe to call more than once for the same payment. The database makes a
 * repeat a no-op — Razorpay sends `payment.captured` and `order.paid` for one
 * payment, and the browser may beat both of them here.
 */
export async function recordPayment(input: {
  reference: string;
  paymentId: string;
  /** Amount the gateway captured, in paise. Checked against the order total. */
  amount: number;
}): Promise<string | null> {
  const supabase = createAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("mark_retail_order_paid", {
    p_reference: input.reference,
    p_payment_id: input.paymentId,
    p_amount: input.amount,
  });

  if (error) {
    // Loud, because this is a payment that has been taken and an order that
    // does not yet reflect it. Whoever reads the logs needs the receipt.
    console.error("[orders] could not record payment", {
      reference: input.reference,
      paymentId: input.paymentId,
      amount: input.amount,
      message: error.message,
    });
    return null;
  }

  return (data as string) ?? null;
}
