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

export function promoPercent(code: string | undefined | null) {
  if (!code) return 0;
  return PROMO_CODES[code.trim().toUpperCase()] ?? 0;
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
  const discount = Math.round((subtotal * percent) / 100);

  return { subtotal, discount, total: subtotal - discount, lines };
}
