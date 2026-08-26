import type {
  WholesaleQuote,
  WholesaleQuoteItem,
  WholesaleQuoteStatus,
} from "@/types/admin";

// ---------------------------------------------------------------------------
// Stored quote rows, as the app's WholesaleQuote.
//
// The wholesale half of what lib/orders/rows.ts does for retail, and separated
// from the reads for the same reason: this is where the two shapes have to
// agree, and the read around it is a round trip with nothing in it to get
// wrong.
//
// One shared mapping matters more here than on the retail side, because a
// wholesale record is read by staff fulfilling it AND by the buyer's own
// dashboard — a business chasing a consignment. Two mappings is how the trade
// portal and the admin panel come to disagree about whether something has
// shipped, in front of a customer with a delivery deadline.
// ---------------------------------------------------------------------------

/** The columns a quote needs, in one round trip. */
export const QUOTE_SELECT = `
  id, reference, kind, status, created_at, delivered_at, shipped_at,
  courier_id, awb, business_name, contact_name, email,
  wholesale_quote_items ( product_id, qty, price_per_unit,
    wholesale_products ( slug, name, sku ) )
`;

export interface QuoteRow {
  id: string;
  reference: string | null;
  kind: string;
  status: string;
  created_at: string;
  delivered_at: string | null;
  shipped_at: string | null;
  courier_id: string | null;
  awb: string | null;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  wholesale_quote_items: Array<{
    product_id: string;
    qty: number;
    price_per_unit: number;
    /** Embedded so a line can name its product. Null if the product is gone. */
    wholesale_products: { slug: string; name: string; sku: string | null } | null;
  }> | null;
}

export function toWholesaleQuote(row: QuoteRow): WholesaleQuote {
  const items: WholesaleQuoteItem[] = (row.wholesale_quote_items ?? []).map((item) => ({
    // The slug, not the uuid — `product.id` is the slug everywhere in this app,
    // and a uuid here would fail every lookup the quote pages do against the
    // catalogue. Falls back to the uuid only when the product row is gone,
    // which at least leaves something traceable rather than an empty cell.
    productId: item.wholesale_products?.slug ?? item.product_id,
    sku: item.wholesale_products?.sku ?? "",
    name: item.wholesale_products?.name ?? item.product_id,
    qty: item.qty,
    pricePerUnit: item.price_per_unit,
  }));

  return {
    // The reference is what the buyer quotes down the phone; the uuid is ours.
    id: row.reference ?? row.id,
    kind: row.kind === "order" ? "order" : "quote",
    requestedAt: row.created_at.slice(0, 10),
    businessName: row.business_name ?? "",
    contactName: row.contact_name ?? "",
    email: row.email ?? "",
    status: row.status as WholesaleQuoteStatus,
    items,
    shipment:
      row.courier_id && row.awb && row.shipped_at
        ? { courierId: row.courier_id, awb: row.awb, shippedAt: row.shipped_at }
        : undefined,
    deliveredAt: row.delivered_at ?? undefined,
  };
}
