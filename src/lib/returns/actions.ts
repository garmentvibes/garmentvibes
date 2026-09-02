"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { reasonToCode } from "./rows";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { getStaffUser } from "@/lib/auth/dal";
import {
  RETURN_STATUSES,
  returnRefundTotal,
  exchangeBalance,
  type ReturnRequest,
  type ReturnStatus,
} from "@/types/returns";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Raising a return, and deciding one.
//
// Two callers with very different rights, which 0007 already separated and
// this file keeps separate:
//
//   * a customer may INSERT a request against their own order, and the policy
//     pins `status = 'requested'` in its WITH CHECK — so "raise a return" and
//     "approve a return" cannot be the same call however the client is
//     written;
//   * staff may do anything, and are the only ones who can move a status.
//
// Nothing here re-checks ownership on the customer path. The policy does it,
// and doing it twice would put the real guard one edit away from being the
// decorative one.
// ---------------------------------------------------------------------------

export interface ReturnWriteResult {
  error: string | null;
  /** The stored reference, so the caller can show the customer their RET code. */
  reference?: string;
  /** True when there was no database; the caller keeps its local store. */
  notConfigured?: boolean;
}

function republish(reference?: string) {
  revalidatePath("/admin/returns");
  revalidatePath("/admin");
  revalidatePath("/shop/orders");
  if (reference) revalidatePath(`/shop/orders/${reference}`);
}

/**
 * Raises a return on one of the caller's own orders.
 *
 * `refund_amount` and `exchange_balance` are computed here from the items
 * rather than accepted from the client, using the same pure helpers the UI
 * displays — a refund total a browser could name is a refund total a browser
 * could inflate. The database constrains them further: 0007 refuses a negative
 * refund and refuses a non-zero balance on anything that is not an exchange.
 *
 * The status is not sent at all. It defaults to `requested`, and the insert
 * policy would refuse anything else.
 */
export async function createReturnRequest(
  input: Omit<ReturnRequest, "id" | "status" | "createdAt">
): Promise<ReturnWriteResult> {
  if (!supabaseConfigured()) return { error: null, notConfigured: true };

  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in to raise a return" };

  if (input.items.length === 0) {
    return { error: "Choose at least one item to return" };
  }

  const supabase = await createClient();

  // The order is addressed by reference because that is what the customer's
  // URL carries. The lookup is RLS-scoped, so a reference belonging to
  // somebody else simply finds nothing rather than returning their order.
  const { data: order } = await supabase
    .from("retail_orders")
    .select("id")
    .eq("reference", input.orderId)
    .maybeSingle();

  if (!order) return { error: "We could not find that order" };

  // Lines carry slugs; the table carries uuids. Resolved in one query rather
  // than one per line.
  const slugs = [
    ...new Set([
      ...input.items.map((i) => i.productId),
      ...input.items.map((i) => i.exchangeForProductId).filter(Boolean),
    ]),
  ] as string[];

  const { data: products } = await supabase
    .from("retail_products")
    .select("id, slug")
    .in("slug", slugs);

  const idBySlug = new Map((products ?? []).map((p) => [p.slug as string, p.id as string]));

  const missing = slugs.filter((slug) => !idBySlug.has(slug));
  if (missing.length > 0) {
    console.error("[returns] a return names products that do not exist", { missing });
    return { error: "Something in that return is no longer in the catalogue" };
  }

  const reference = `RET${Date.now().toString().slice(-8)}`;

  const { data: created, error } = await supabase
    .from("return_requests")
    .insert({
      reference,
      order_id: order.id,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      phone: input.phone,
      resolution: input.resolution,
      reason: reasonToCode(input.reason),
      comments: input.comments ?? null,
      // Derived, never accepted. See the note above.
      refund_amount: returnRefundTotal({ ...input, id: "", status: "requested", createdAt: "" }),
      exchange_balance:
        input.resolution === "exchange"
          ? exchangeBalance({ ...input, id: "", status: "requested", createdAt: "" })
          : 0,
    })
    .select("id, reference")
    .single();

  if (error) {
    console.error("[returns] could not raise the return", {
      orderId: input.orderId,
      message: error.message,
    });
    return { error: "We could not raise that return. Please try again." };
  }

  const { error: itemsError } = await supabase.from("return_items").insert(
    input.items.map((item) => ({
      return_id: created.id,
      product_id: idBySlug.get(item.productId)!,
      product_name: item.name,
      size_label: item.size,
      color: item.color,
      qty: item.qty,
      price: item.price,
      exchange_for_size: item.exchangeForSize ?? null,
      exchange_for_product_id: item.exchangeForProductId
        ? idBySlug.get(item.exchangeForProductId)!
        : null,
      exchange_for_price: item.exchangeForPrice ?? null,
    }))
  );

  if (itemsError) {
    console.error("[returns] could not save the return's items", {
      reference,
      message: itemsError.message,
    });
    // The header exists with no lines, which reads as an empty return in the
    // queue. Removing it is the honest cleanup: 0007 cascades the items, and a
    // half-written request is worse than none.
    await supabase.from("return_requests").delete().eq("id", created.id);
    return { error: "We could not raise that return. Please try again." };
  }

  republish(input.orderId);

  return { error: null, reference: created.reference ?? reference };
}

/**
 * Moves a return through the queue. Staff only.
 *
 * The decision note is stored on both the approve and reject paths, because a
 * refused return the customer cannot get an explanation for is a support
 * ticket that starts from nothing.
 */
export async function setReturnStatus(
  reference: string,
  status: ReturnStatus,
  decisionNote?: string
): Promise<ReturnWriteResult> {
  if (!supabaseConfigured()) return { error: null, notConfigured: true };

  const staff = await getStaffUser();
  if (!staff) return { error: "Only staff can decide returns" };

  // Checked against the list rather than trusted: this is a server action, so
  // the argument is whatever was posted, and it goes into an enum column.
  if (!RETURN_STATUSES.includes(status)) {
    return { error: `${status} is not a return status` };
  }

  const supabase = await createClient();

  const patch: Database["public"]["Tables"]["return_requests"]["Update"] = { status };
  if (decisionNote !== undefined) patch.decision_note = decisionNote || null;

  const { data, error } = await supabase
    .from("return_requests")
    .update(patch)
    .eq("reference", reference)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[returns] could not set the status", {
      reference,
      status,
      message: error.message,
    });
    return { error: "Could not update that return" };
  }

  if (!data) return { error: "No such return" };

  republish();

  return { error: null, reference };
}
