import type { CartLine } from "@/lib/stores/cart-store";

// ---------------------------------------------------------------------------
// What crosses the wire when a local bag is offered to the server.
//
// Kept apart from ./lines.ts, which resolves stored rows against the catalogue
// and therefore imports all 33 retail products. This half runs in the browser —
// `useCartReconciliation` calls it before every sync — and importing that
// module from a client component would pull the whole catalogue into the
// bundle to read four fields off an object that already has them.
// ---------------------------------------------------------------------------

/** The four fields `cart_merge()` reads out of a local line. */
export interface MergeLine {
  slug: string;
  size: string;
  color: string;
  qty: number;
}

/**
 * The variant and quantity of each local line, and nothing else.
 *
 * The price does not travel. `cart_items` has no column for it and the server
 * would have no reason to believe it if it did — prices are re-derived from
 * the catalogue on the way back out — so sending it would suggest to whoever
 * reads this next that it means something.
 *
 * Nor does the name or the image, which is the same point in a smaller way:
 * this runs on every page load for every signed-in customer, and three fields
 * per line that are thrown away on arrival is a cost paid on all of them.
 */
export function mergePayload(lines: CartLine[]): MergeLine[] {
  return lines.map((line) => ({
    slug: line.slug,
    size: line.size,
    color: line.color,
    qty: line.qty,
  }));
}
