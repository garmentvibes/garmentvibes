import { NextResponse } from "next/server";
import { isRazorpayConfigured } from "@/lib/razorpay/config";
import { createRazorpayOrder, RazorpayError } from "@/lib/razorpay/client";
import { priceOrder, PricingError } from "@/lib/pricing";
import { generateReferenceId } from "@/lib/utils";
import { callerKey, createRateLimiter, rateLimitHeaders } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";

// Creates the Razorpay order the browser then pays against.
//
// Two ways in, and the first is the real one:
//
//   1. `{ reference }` — the order already exists in the database, placed by
//      place_retail_order() with its stock taken and every amount checked. The
//      gateway order is created for THAT row's total and keyed on ITS receipt,
//      so a payment can always be reconciled against an order that exists.
//      The row is read as the signed-in customer, so RLS is what proves the
//      order is theirs; there is no ownership check to get wrong here.
//
//   2. `{ items, promoCode }` — the fallback for a deployment with no Supabase
//      project, where there is nowhere to place an order first. Prices from
//      the catalogue exactly as before. Kept because it is the state this
//      repository is in and what the test suite exercises.
//
// Neither accepts an amount from the browser. That is the whole point of the
// route: see lib/pricing.ts for what a client-supplied total buys you.

// Ten a minute. A customer reaching checkout creates one order, retries once
// or twice at worst; a script creating hundreds is either probing our pricing
// or running up order records at Razorpay's end, and neither is something to
// serve politely. Kept per-process — see lib/rate-limit.ts for what that does
// and does not protect against.
const LIMIT = 10;
const limiter = createRateLimiter({ limit: LIMIT, windowMs: 60_000 });

export async function POST(request: Request) {
  // Before parsing the body, so a flood costs us a Map lookup rather than a
  // JSON parse of whatever size the caller chose to send.
  const rate = limiter.check(callerKey(request.headers));
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many order attempts. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(LIMIT, rate) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { items, promoCode, reference } = (body ?? {}) as {
    items?: Array<{ productId: string; qty: number }>;
    promoCode?: string;
    reference?: string;
  };

  try {
    // ---------------------------------------------------------------
    // 1. A placed order
    // ---------------------------------------------------------------
    if (reference && supabaseConfigured()) {
      const supabase = await createClient();
      const { data: order, error } = await supabase
        .from("retail_orders")
        .select("reference, total, status")
        .eq("reference", reference)
        .maybeSingle();

      // RLS scopes this to the caller's own orders, so "not found" covers both
      // a bad reference and somebody else's — deliberately indistinguishable.
      if (error || !order) {
        return NextResponse.json(
          { error: "unknown_order", message: "That order could not be found." },
          { status: 404 }
        );
      }

      // Only an unpaid order is payable. A confirmed one has been paid for
      // already, and creating a second gateway order against it is how a
      // customer gets charged twice for one basket.
      if (order.status !== "pending") {
        return NextResponse.json(
          { error: "not_payable", message: "That order is not awaiting payment." },
          { status: 409 }
        );
      }

      if (!isRazorpayConfigured()) {
        return NextResponse.json(
          { error: "not_configured", message: "Razorpay keys are not set on this deployment." },
          { status: 503 }
        );
      }

      // `reference` rather than `order.reference`: the column is nullable, and
      // this is the value the row was found by, so it is a string by the guard
      // at the top of this branch and needs no assertion to say so.
      const gatewayOrder = await createRazorpayOrder({
        amount: order.total,
        receipt: reference,
        notes: { receipt: reference },
      });

      return NextResponse.json({
        orderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        receipt: order.reference,
      });
    }

    // ---------------------------------------------------------------
    // 2. No database to place into
    // ---------------------------------------------------------------
    // Priced before the configuration check on purpose: whether the request
    // is well-formed doesn't depend on whether keys happen to be set, and
    // validating first keeps this gate exercised by the test suite even on a
    // deployment with no Razorpay account.
    const priced = priceOrder(items ?? [], promoCode);

    if (!isRazorpayConfigured()) {
      // Not an error condition yet: no account exists, and the storefront
      // falls back to the simulated flow when it sees this.
      return NextResponse.json(
        { error: "not_configured", message: "Razorpay keys are not set on this deployment." },
        { status: 503 }
      );
    }

    const receipt = generateReferenceId("GV");

    const order = await createRazorpayOrder({
      amount: priced.total,
      receipt,
      notes: { receipt },
    });

    // Only what the browser needs to open Checkout. The amount is echoed
    // back from Razorpay's response, not from the request.
    return NextResponse.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt,
    });
  } catch (error) {
    if (error instanceof PricingError) {
      return NextResponse.json({ error: "invalid_order", message: error.message }, { status: 400 });
    }
    if (error instanceof RazorpayError) {
      console.error("[razorpay] order creation failed", error.message);
      return NextResponse.json({ error: "gateway_error" }, { status: error.status });
    }
    console.error("[razorpay] unexpected error creating order", error);
    return NextResponse.json({ error: "unexpected_error" }, { status: 500 });
  }
}
