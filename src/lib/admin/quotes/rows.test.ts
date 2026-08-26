import { describe, expect, it } from "vitest";

import { toWholesaleQuote, type QuoteRow } from "./rows";

// ---------------------------------------------------------------------------
// The mapping staff and the buyer both read through.
//
// Shared on purpose: the admin panel and the trade portal are two ends of one
// conversation, often happening live on the phone. A mapping that differs
// between them is how they come to disagree about whether a consignment has
// shipped.
// ---------------------------------------------------------------------------

function row(overrides: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: "9a1c0b2d-0000-0000-0000-000000000001",
    reference: "GV-Q-2210",
    kind: "quote",
    status: "requested",
    created_at: "2026-08-18T09:15:00.000Z",
    delivered_at: null,
    shipped_at: null,
    courier_id: null,
    awb: null,
    business_name: "Sunrise Traders",
    contact_name: "Meera Iyer",
    email: "meera@sunrisetraders.example",
    wholesale_quote_items: [
      {
        product_id: "3f0a5c11-0000-0000-0000-000000000009",
        qty: 240,
        price_per_unit: 21900,
        wholesale_products: {
          slug: "cotton-round-neck-tee-bulk",
          name: "Cotton Round Neck Tee (Bulk)",
          sku: "GV-WS-TEE-001",
        },
      },
    ],
    ...overrides,
  };
}

describe("toWholesaleQuote", () => {
  it("identifies the quote by its reference", () => {
    expect(toWholesaleQuote(row()).id).toBe("GV-Q-2210");
  });

  it("falls back to the uuid when there is no reference", () => {
    expect(toWholesaleQuote(row({ reference: null })).id).toBe(
      "9a1c0b2d-0000-0000-0000-000000000001"
    );
  });

  it("uses the product's slug as its id, not the stored uuid", () => {
    // `product.id` is the slug everywhere in this app — a static check pins it.
    // A uuid here would fail every catalogue lookup the quote pages do.
    const quote = toWholesaleQuote(row());
    expect(quote.items[0].productId).toBe("cotton-round-neck-tee-bulk");
    expect(quote.items[0].sku).toBe("GV-WS-TEE-001");
    expect(quote.items[0].name).toBe("Cotton Round Neck Tee (Bulk)");
  });

  it("keeps a line whose product has gone, rather than dropping it", () => {
    // A withdrawn product must not make a line vanish from a quote somebody is
    // being invoiced for. The uuid is at least traceable.
    const quote = toWholesaleQuote(
      row({
        wholesale_quote_items: [
          {
            product_id: "3f0a5c11-0000-0000-0000-000000000009",
            qty: 100,
            price_per_unit: 19900,
            wholesale_products: null,
          },
        ],
      })
    );

    expect(quote.items).toHaveLength(1);
    expect(quote.items[0].productId).toBe("3f0a5c11-0000-0000-0000-000000000009");
    expect(quote.items[0].sku).toBe("");
  });

  it("distinguishes a quote from a placed bulk order", () => {
    expect(toWholesaleQuote(row()).kind).toBe("quote");
    expect(toWholesaleQuote(row({ kind: "order" })).kind).toBe("order");
  });

  it("treats an unrecognised kind as a quote", () => {
    // The safer default: a quote is a request, an order is a commitment, and
    // mislabelling the first as the second is the expensive direction.
    expect(toWholesaleQuote(row({ kind: "something-else" })).kind).toBe("quote");
  });

  it("reports a shipment only when all three parts are there", () => {
    expect(toWholesaleQuote(row({ courier_id: "bluedart" })).shipment).toBeUndefined();

    const shipped = toWholesaleQuote(
      row({ courier_id: "bluedart", awb: "77881234", shipped_at: "2026-08-24" })
    );
    expect(shipped.shipment).toEqual({
      courierId: "bluedart",
      awb: "77881234",
      shippedAt: "2026-08-24",
    });
  });

  it("carries the delivery date bulk claims run from", () => {
    // 0007 gives a buyer 7 days from delivery to raise a short shipment or
    // transit damage, so this is not cosmetic.
    expect(toWholesaleQuote(row({ delivered_at: "2026-08-27" })).deliveredAt).toBe("2026-08-27");
    expect(toWholesaleQuote(row()).deliveredAt).toBeUndefined();
  });

  it("survives a quote with no lines", () => {
    const quote = toWholesaleQuote(row({ wholesale_quote_items: null }));
    expect(quote.items).toEqual([]);
  });
});
