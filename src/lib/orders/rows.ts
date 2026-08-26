import type { RetailOrder, RetailOrderItem, RetailOrderStatus } from "@/types/admin";

// ---------------------------------------------------------------------------
// Stored order rows, as the app's RetailOrder.
//
// Pure, and lifted out of ./reads.ts because there are now two readers of the
// same table: a customer reading their own orders, and staff reading everyone's
// to fulfil them. One mapping, so the two cannot come to disagree about what an
// order says — the admin panel and the customer's own page quoting different
// statuses at each other over the phone is a support call that starts with
// nobody being wrong.
//
// The select is here too, for the same reason: a column added for one reader
// and forgotten by the other is how a field silently renders blank on one page
// and not the other.
// ---------------------------------------------------------------------------

/** The columns an order needs, in one round trip. */
export const ORDER_SELECT = `
  id, reference, status, created_at, delivered_at, shipped_at,
  courier_id, awb, customer_name, customer_email, phone,
  shipping_address, payment_method,
  retail_order_items ( product_id, product_name, size, color, qty, price )
`;

export interface OrderRow {
  id: string;
  reference: string | null;
  status: string;
  created_at: string;
  delivered_at: string | null;
  shipped_at: string | null;
  courier_id: string | null;
  awb: string | null;
  customer_name: string | null;
  customer_email: string | null;
  phone: string | null;
  shipping_address: Record<string, unknown> | null;
  payment_method: string;
  retail_order_items: Array<{
    product_id: string;
    product_name: string | null;
    size: string;
    color: string;
    qty: number;
    price: number;
  }>;
}

/**
 * Flattens the stored address JSON into the single line the UI prints.
 *
 * The order carries a snapshot rather than a join, so this is whatever the
 * address looked like when the order was placed — which is the address the
 * parcel went to, and the one that belongs on the invoice, even if the
 * customer has since edited their address book.
 */
export function formatAddress(address: Record<string, unknown> | null): string {
  if (!address) return "";
  const parts = [
    address.addressLine1 ?? address.line1,
    address.city,
    address.state,
    address.pincode,
  ];
  return parts.filter(Boolean).join(", ");
}

export function toRetailOrder(row: OrderRow): RetailOrder {
  const items: RetailOrderItem[] = (row.retail_order_items ?? []).map((item) => ({
    productId: item.product_id,
    // Snapshotted at order time. Falling back to the id rather than to a
    // product lookup: the point of storing the name was that a renamed or
    // withdrawn product must not change what an order says it was for.
    name: item.product_name ?? item.product_id,
    size: item.size,
    color: item.color,
    qty: item.qty,
    price: item.price,
  }));

  return {
    // The reference is what the customer was shown and what Razorpay holds.
    // The uuid is ours; putting it in a URL would mean support and the
    // customer quoting different numbers at each other.
    id: row.reference ?? row.id,
    placedAt: row.created_at.slice(0, 10),
    deliveredAt: row.delivered_at ?? undefined,
    shipment:
      row.courier_id && row.awb && row.shipped_at
        ? { courierId: row.courier_id, awb: row.awb, shippedAt: row.shipped_at }
        : undefined,
    customerName: row.customer_name ?? "",
    customerEmail: row.customer_email ?? "",
    phone: row.phone ?? "",
    shippingAddress: formatAddress(row.shipping_address),
    // The stored enum grew past the two the UI type knows about in 0012 —
    // upi, card, netbanking, wallet and emi are all online as far as anything
    // customer-facing is concerned, and the specific method is a
    // reconciliation detail rather than something to print on an order card.
    paymentMethod: row.payment_method === "cod" ? "cod" : "online",
    status: row.status as RetailOrderStatus,
    items,
  };
}
