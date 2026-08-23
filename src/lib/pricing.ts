// Order pricing, shared by the checkout UI and the payment API.
//
// The critical property here: the server recomputes every amount from the
// catalog. A payment route that accepts an amount from the browser lets
// anyone buy a ₹3,499 saree for ₹1 by editing one request, so the client
// sends only *what* is being bought — product ids, quantities and a promo
// code — and the price is looked up, never accepted.

import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";

export const PROMO_CODES: Record<string, number> = {
  GARMENT10: 10,
  WELCOME5: 5,
};

/**
 * What a code is worth here, or null if this module cannot price it.
 *
 * The null matters. This used to return 0 for anything outside the map above,
 * which reads like a safe default and is the opposite: the checkout page
 * applies codes from the admin panel and from referrals, neither of which is
 * in this list, so a customer shown "₹1,039.20 after WELCOME20" had a Razorpay
 * order created for the full ₹1,299 — silently charged the whole discount back.
 *
 * A code we cannot price is not a code worth nothing. It is a code this
 * process has no opinion about, and the only safe thing to do with it is
 * refuse to take the payment.
 */
export function promoPercent(code: string | undefined | null): number | null {
  if (!code) return 0;
  return PROMO_CODES[code.trim().toUpperCase()] ?? null;
}

/**
 * Whether the payment route can price this code, and therefore whether the
 * gateway will charge what the basket says.
 *
 * The checkout page uses this to decide which payment methods to offer. It is
 * the same question `promoPercent` answers, named for the decision it drives
 * so that the call site reads as what it means.
 */
export function isServerPriceable(code: string | undefined | null): boolean {
  return promoPercent(code) !== null;
}

export interface OrderLineInput {
  productId: string;
  qty: number;
}

export interface PricedOrder {
  subtotal: number; // minor units
  discount: number;
  total: number;
  lines: Array<{ productId: string; name: string; qty: number; price: number }>;
}

export class PricingError extends Error {}

/**
 * Prices an order from trusted catalog data.
 *
 * Throws rather than silently skipping an unknown product or a nonsense
 * quantity — a payment must never be created for an order we cannot price.
 */
export function priceOrder(
  items: OrderLineInput[],
  promoCode?: string | null
): PricedOrder {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PricingError("Order must contain at least one item");
  }

  const lines = items.map((item) => {
    const product = RETAIL_PRODUCTS.find((p) => p.id === item.productId);
    if (!product) {
      throw new PricingError(`Unknown product: ${item.productId}`);
    }
    if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      throw new PricingError(`Invalid quantity for ${item.productId}`);
    }
    return { productId: product.id, name: product.name, qty: item.qty, price: product.price };
  });

  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.price, 0);

  const percent = promoPercent(promoCode);
  if (percent === null) {
    // Refusing is the whole point. Charging full price for a discount the
    // customer was quoted is worse than any error message.
    throw new PricingError(
      `${promoCode} cannot be applied to an online payment. Remove it, or pay by cash on delivery.`
    );
  }

  const discount = Math.round((subtotal * percent) / 100);

  return { subtotal, discount, total: subtotal - discount, lines };
}
