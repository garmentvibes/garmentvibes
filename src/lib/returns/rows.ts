import type {
  ResolutionType,
  ReturnItem,
  ReturnReason,
  ReturnRequest,
  ReturnStatus,
} from "@/types/returns";

// ---------------------------------------------------------------------------
// Stored return rows, as the app's ReturnRequest.
//
// Shared between the customer raising a return and staff deciding it, for the
// reason every other shared mapping in this app exists: those are two ends of
// one conversation, and a mapping that differs between them is how the two
// sides come to disagree about what was asked for.
//
// ---------------------------------------------------------------------------
// Two identifier translations, not one
// ---------------------------------------------------------------------------
//
// This mapping does more work than the others because the table stores uuids
// where the app uses human identifiers, in two places:
//
//   * `order_id` is a uuid; `ReturnRequest.orderId` is the order's reference —
//     what the customer sees, what the URL carries, and what support quotes.
//   * `product_id` is a uuid; `ReturnItem.productId` is the product's slug,
//     which a static check pins as equal to `product.id` everywhere.
//
// Both are resolved by embedding the related row rather than by a second
// query. Getting either wrong is not a crash: it is a return that renders with
// a blank product name, or one that cannot be matched to the order it belongs
// to, which is worse because it looks like data rather than a bug.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Reasons are the one field where the two sides do not share a vocabulary
// ---------------------------------------------------------------------------
//
// `resolution` and `status` line up exactly — 'refund'/'exchange' and the six
// statuses are the same strings in the app and in the enums. `reason` does
// not: the app's ReturnReason is the sentence a customer picks off a dropdown
// ("Size or fit issue"), and `return_reason` is a code (`size_or_fit`).
//
// That has to be translated in both directions, and getting it wrong in either
// is expensive in a way that does not look like a bug:
//
//   * writing the sentence straight into the column raises "invalid input
//     value for enum return_reason" at a customer mid-return;
//   * reading the code straight out as a ReturnReason type-checks under a cast
//     and then never matches RESTOCKABLE_REASONS, so nothing is ever put back
//     on the shelf and no back-in-stock alert ever fires. Silently.
//
// One table, used both ways, so the two cannot drift apart.
const REASON_TO_CODE: Record<ReturnReason, string> = {
  "Size or fit issue": "size_or_fit",
  "Item damaged or defective": "damaged_or_defective",
  "Wrong item delivered": "wrong_item",
  "Not as described or pictured": "not_as_described",
  "Quality not as expected": "quality_below_expectation",
  "Changed my mind": "changed_mind",
};

const REASON_FROM_CODE = Object.fromEntries(
  Object.entries(REASON_TO_CODE).map(([label, code]) => [code, label])
) as Record<string, ReturnReason>;

/** The enum code for a reason the customer picked. */
export function reasonToCode(reason: ReturnReason): string {
  return REASON_TO_CODE[reason];
}

/**
 * The reason a stored code means.
 *
 * An unknown code falls back to "Item damaged or defective" — chosen because
 * it is NOT in RESTOCKABLE_REASONS. The fallback decides whether goods go back
 * on the shelf, so it has to fail towards leaving them off it: re-selling
 * something that might be faulty is a customer receiving a damaged garment,
 * while the other direction is a unit somebody has to look at by hand.
 *
 * A code only becomes unknown if the enum grows and the app is not rebuilt,
 * which is exactly when nobody is watching.
 */
export function reasonFromCode(code: string): ReturnReason {
  return REASON_FROM_CODE[code] ?? "Item damaged or defective";
}

/** A return with its items, its order's reference, and each item's slug. */
export const RETURN_SELECT = `
  id, reference, status, resolution, reason, comments, decision_note,
  customer_name, customer_email, phone, created_at, updated_at,
  retail_orders ( reference ),
  return_items (
    product_id, product_name, size_label, color, qty, price,
    exchange_for_size, exchange_for_price,
    retail_products!return_items_product_id_fkey ( slug ),
    exchange_product:retail_products!return_items_exchange_for_product_id_fkey ( slug )
  )
`;

export interface ReturnRow {
  id: string;
  reference: string | null;
  status: string;
  resolution: string;
  reason: string;
  comments: string | null;
  decision_note: string | null;
  customer_name: string;
  customer_email: string;
  phone: string;
  created_at: string;
  updated_at: string | null;
  retail_orders: { reference: string | null } | null;
  return_items: Array<{
    product_id: string;
    product_name: string;
    size_label: string;
    color: string;
    qty: number;
    price: number;
    exchange_for_size: string | null;
    exchange_for_price: number | null;
    retail_products: { slug: string } | null;
    exchange_product: { slug: string } | null;
  }> | null;
}

export function toReturnRequest(row: ReturnRow): ReturnRequest {
  const items: ReturnItem[] = (row.return_items ?? []).map((item) => ({
    // The slug, falling back to the uuid only if the product row has gone —
    // which at least leaves something traceable rather than an empty cell.
    productId: item.retail_products?.slug ?? item.product_id,
    // Snapshotted on the line at request time, so a renamed product does not
    // change what a past return says it was for.
    name: item.product_name,
    size: item.size_label,
    color: item.color,
    qty: item.qty,
    price: item.price,
    exchangeForSize: item.exchange_for_size ?? undefined,
    // Absent means a like-for-like size swap on the same product, which is a
    // different thing from a cross-product exchange and must not be conflated:
    // one of them moves stock on a second product.
    exchangeForProductId: item.exchange_product?.slug ?? undefined,
    exchangeForPrice: item.exchange_for_price ?? undefined,
  }));

  return {
    // The RET… code the customer quotes at us.
    id: row.reference ?? row.id,
    // The order's reference, not its uuid: this is what the return is shown
    // against on both sides.
    orderId: row.retail_orders?.reference ?? "",
    resolution: row.resolution as ResolutionType,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    phone: row.phone,
    items,
    reason: reasonFromCode(row.reason),
    comments: row.comments ?? undefined,
    status: row.status as ReturnStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    decisionNote: row.decision_note ?? undefined,
  };
}
