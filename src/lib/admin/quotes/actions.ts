"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { courierById } from "@/lib/couriers";
import { notifyQuoteStatus } from "@/lib/notifications/quotes";
import { WHOLESALE_QUOTE_STATUSES, type WholesaleQuoteStatus } from "@/types/admin";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Moving a quote or bulk order through fulfilment.
//
// The wholesale half of lib/admin/orders/actions.ts, and the same shape: plain
// updates under the staff policy from 0004, dates stamped server-side, and the
// buyer's message queued from the status the database ended up holding rather
// than the one the caller asked for.
//
// `delivered_at` carries the same weight here as on the retail side, for a
// different reason: bulk claims — short shipment, transit damage — run from it,
// and 0007 gives the buyer 7 days. A wrong date either closes a legitimate
// claim early or leaves us open to one indefinitely.
// ---------------------------------------------------------------------------

export interface QuoteWriteResult {
  error: string | null;
  /** True when there was no database to write to; the caller keeps its store. */
  notConfigured?: boolean;
}

const NOT_STAFF: QuoteWriteResult = { error: "Only staff can manage quotes" };

async function staffClient() {
  if (!supabaseConfigured()) return { client: null, notConfigured: true as const };

  const staff = await getStaffUser();
  if (!staff) return { client: null, notConfigured: false as const };

  return { client: await createClient(), notConfigured: false as const };
}

function republish(reference: string) {
  revalidatePath(`/admin/quotes/${reference}`);
  revalidatePath("/admin/quotes");
  revalidatePath("/admin");
  // The buyer's own dashboard reads the same row, and a business chasing a
  // consignment is exactly who a stale status costs.
  revalidatePath("/wholesale/orders");
  revalidatePath("/wholesale/dashboard");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Sets a quote's status, and tells the buyer when it is one they act on. */
export async function setWholesaleQuoteStatus(
  reference: string,
  status: WholesaleQuoteStatus
): Promise<QuoteWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  // Checked against the list rather than trusted: this is a server action, so
  // the argument is whatever was posted, and it goes into an enum column.
  if (!WHOLESALE_QUOTE_STATUSES.includes(status)) {
    return { error: `${status} is not a quote status` };
  }

  const patch: Database["public"]["Tables"]["wholesale_quotes"]["Update"] = { status };
  if (status === "shipped") patch.shipped_at = today();
  if (status === "fulfilled") patch.delivered_at = today();

  const { data, error } = await client
    .from("wholesale_quotes")
    .update(patch)
    .eq("reference", reference)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/quotes] could not set status", {
      reference,
      status,
      message: error.message,
    });
    return { error: "Could not update that quote" };
  }

  if (!data) return { error: "No such quote" };

  await notifyQuoteStatus(data.id);

  republish(reference);

  return { error: null };
}

/**
 * Attaches a courier and tracking number, and moves the consignment to shipped.
 *
 * One action, like the retail side: an AWB on a quote still marked
 * `in_production` is a consignment the courier has and the buyer has not been
 * told to expect.
 */
export async function setWholesaleShipment(
  reference: string,
  courierId: string,
  awb: string
): Promise<QuoteWriteResult> {
  const { client, notConfigured } = await staffClient();
  if (notConfigured) return { error: null, notConfigured: true };
  if (!client) return NOT_STAFF;

  const trimmed = awb.trim();
  if (!trimmed) return { error: "Enter the tracking number" };
  if (!courierById(courierId)) return { error: "Choose a courier" };

  const { data, error } = await client
    .from("wholesale_quotes")
    .update({
      courier_id: courierId,
      awb: trimmed,
      status: "shipped",
      shipped_at: today(),
    })
    .eq("reference", reference)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin/quotes] could not save the shipment", {
      reference,
      message: error.message,
    });
    return { error: "Could not save that shipment" };
  }

  if (!data) return { error: "No such quote" };

  await notifyQuoteStatus(data.id);

  republish(reference);

  return { error: null };
}
