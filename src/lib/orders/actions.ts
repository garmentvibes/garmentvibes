"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { buildOrderPayload, OrderPayloadError, type BuildOrderInput } from "./payload";

// ---------------------------------------------------------------------------
// Placing an order.
//
// All the arithmetic is in ./payload.ts, which is pure and tested. What is
// left here is an auth check and one RPC — deliberately, so that the part with
// nothing to get wrong is the part that cannot be tested without a database.
//
// This environment's network policy blocks *.supabase.co, so this call has
// never been executed against PostgREST from inside the app. The SQL on the
// other end HAS been run against the live project and against a scratch
// Postgres in CI — see supabase/tests/40_order_placement.sql — and the
// arguments it receives are unit-tested here. The unverified span is the
// @supabase/ssr → PostgREST → RPC hop, and it is the first thing to exercise
// on a real deployment.
// ---------------------------------------------------------------------------

export type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; reason: PlaceOrderFailure };

export type PlaceOrderFailure =
  | "not_configured"
  | "not_signed_in"
  | "invalid_order"
  | "out_of_stock"
  | "price_changed"
  | "promo_rejected"
  | "duplicate_reference"
  | "unknown";

/**
 * Maps a Postgres error onto something a customer can act on.
 *
 * The messages place_retail_order() raises are written for whoever is reading
 * the logs, and they name product ids and paise. Showing them to a customer
 * would be both confusing and a small information leak, so the raw message
 * stays server-side and only the category crosses over.
 */
function classify(message: string): { reason: PlaceOrderFailure; error: string } {
  if (message.includes("not enough stock")) {
    return {
      reason: "out_of_stock",
      error: "Something in your bag sold out while you were checking out. Please review it.",
    };
  }
  if (message.includes("price mismatch") || message.includes("subtotal mismatch")
      || message.includes("total mismatch") || message.includes("is not on sale")) {
    return {
      reason: "price_changed",
      error: "Prices in your bag have changed. Please review it and try again.",
    };
  }
  if (message.includes("promo code") || message.includes("discount")) {
    return {
      reason: "promo_rejected",
      error: "That promo code is not valid on this order.",
    };
  }
  // A reference collision is our fault, not the customer's, and retrying with
  // a fresh one is the whole fix.
  if (message.includes("retail_orders_reference_key")) {
    return {
      reason: "duplicate_reference",
      error: "We could not save that order. Please try again.",
    };
  }
  if (message.includes("no authenticated user")) {
    return { reason: "not_signed_in", error: "Please sign in to place your order." };
  }
  return {
    reason: "unknown",
    error: "We could not place that order. Nothing has been charged.",
  };
}

export async function placeRetailOrder(input: BuildOrderInput): Promise<PlaceOrderResult> {
  if (!supabaseConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      error: "Ordering is not available on this deployment.",
    };
  }

  let payload;
  try {
    payload = buildOrderPayload(input);
  } catch (error) {
    if (error instanceof OrderPayloadError) {
      return { ok: false, reason: "invalid_order", error: error.message };
    }
    throw error;
  }

  const supabase = await createClient();

  // getUser(), not getSession(): the latter trusts the cookie as it stands,
  // and this is the last gate before stock is taken.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, reason: "not_signed_in", error: "Please sign in to place your order." };
  }

  // The function reads auth.uid() itself, so the payload never says who is
  // ordering — there is nothing here for a caller to substitute.
  const { data, error } = await supabase.rpc("place_retail_order", payload);

  if (error) {
    console.error("place_retail_order failed", {
      reference: payload.p_reference,
      code: error.code,
      message: error.message,
    });
    return { ok: false, ...classify(error.message) };
  }

  return { ok: true, orderId: data as string };
}
