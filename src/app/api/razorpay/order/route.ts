import { NextResponse } from "next/server";
import { isRazorpayConfigured } from "@/lib/razorpay/config";
import { createRazorpayOrder, RazorpayError } from "@/lib/razorpay/client";
import { priceOrder, PricingError } from "@/lib/pricing";
import { generateReferenceId } from "@/lib/utils";

// Creates the Razorpay order the browser then pays against.
//
// The request body says only WHAT is being bought. The amount is computed
// here from the catalog — see lib/pricing.ts for why accepting a
// client-supplied total would be a way to buy anything for a rupee.

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { items, promoCode } = (body ?? {}) as {
    items?: Array<{ productId: string; qty: number }>;
    promoCode?: string;
  };

  try {
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
