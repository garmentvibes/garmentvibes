import { describe, expect, it } from "vitest";

import { reasonFromCode, reasonToCode, toReturnRequest, type ReturnRow } from "./rows";
import { RETURN_REASONS, exchangeBalance, isRestockable, returnRefundTotal } from "@/types/returns";

// ---------------------------------------------------------------------------
// The return mapping.
//
// It does two identifier translations the other mappings do not — order uuid
// to reference, product uuid to slug — and each has a distinct way of going
// wrong that looks like data rather than a bug: a return that cannot be
// matched to its order, or one that renders with a blank product.
// ---------------------------------------------------------------------------

function row(overrides: Partial<ReturnRow> = {}): ReturnRow {
  return {
    id: "c3d5e7f9-0000-0000-0000-000000000001",
    reference: "RET44120087",
    status: "requested",
    resolution: "refund",
    reason: "size_or_fit",
    comments: "Runs narrow at the shoulder.",
    decision_note: null,
    customer_name: "Aditi Rao",
    customer_email: "aditi@example.com",
    phone: "+919876543210",
    created_at: "2026-08-22T10:00:00.000Z",
    updated_at: null,
    retail_orders: { reference: "GV-1042" },
    return_items: [
      {
        product_id: "11111111-0000-0000-0000-000000000001",
        product_name: "Floral Anarkali Kurta",
        size_label: "M",
        color: "Rose",
        qty: 2,
        price: 129900,
        exchange_for_size: null,
        exchange_for_price: null,
        retail_products: { slug: "floral-anarkali-kurta" },
        exchange_product: null,
      },
    ],
    ...overrides,
  };
}

describe("toReturnRequest", () => {
  it("identifies the return by its RET reference", () => {
    expect(toReturnRequest(row()).id).toBe("RET44120087");
  });

  it("shows the order by its reference, not its uuid", () => {
    // What the customer sees, what the URL carries, and what support quotes.
    expect(toReturnRequest(row()).orderId).toBe("GV-1042");
  });

  it("resolves each line's product to its slug", () => {
    // `product.id` is the slug everywhere in this app — a static check pins it
    // — so a uuid here would fail every catalogue lookup the return pages do,
    // including the one that decides which stock to put back.
    expect(toReturnRequest(row()).items[0].productId).toBe("floral-anarkali-kurta");
  });

  it("falls back to the uuid if the product row has gone", () => {
    const request = toReturnRequest(
      row({
        return_items: [
          {
            product_id: "11111111-0000-0000-0000-000000000001",
            product_name: "Withdrawn Kurta",
            size_label: "M",
            color: "Rose",
            qty: 1,
            price: 129900,
            exchange_for_size: null,
            exchange_for_price: null,
            retail_products: null,
            exchange_product: null,
          },
        ],
      })
    );

    expect(request.items[0].productId).toBe("11111111-0000-0000-0000-000000000001");
    // The name is snapshotted on the line, so it survives the product going.
    expect(request.items[0].name).toBe("Withdrawn Kurta");
  });

  it("adds the refund up from the lines", () => {
    expect(returnRefundTotal(toReturnRequest(row()))).toBe(259800);
  });

  it("leaves a plain refund with no exchange fields", () => {
    const item = toReturnRequest(row()).items[0];
    expect(item.exchangeForSize).toBeUndefined();
    expect(item.exchangeForProductId).toBeUndefined();
    expect(item.exchangeForPrice).toBeUndefined();
  });

  it("treats a same-product size swap as having no replacement product", () => {
    // The distinction matters: a cross-product exchange moves stock on a
    // second product, and a like-for-like swap does not.
    const request = toReturnRequest(
      row({
        resolution: "exchange",
        return_items: [
          {
            product_id: "11111111-0000-0000-0000-000000000001",
            product_name: "Floral Anarkali Kurta",
            size_label: "M",
            color: "Rose",
            qty: 1,
            price: 129900,
            exchange_for_size: "L",
            exchange_for_price: 129900,
            retail_products: { slug: "floral-anarkali-kurta" },
            exchange_product: null,
          },
        ],
      })
    );

    expect(request.items[0].exchangeForSize).toBe("L");
    expect(request.items[0].exchangeForProductId).toBeUndefined();
    // Like-for-like: nobody owes anybody anything, which is why that path
    // never asks for money.
    expect(exchangeBalance(request)).toBe(0);
  });

  it("resolves a cross-product exchange to the replacement's slug", () => {
    const request = toReturnRequest(
      row({
        resolution: "exchange",
        return_items: [
          {
            product_id: "11111111-0000-0000-0000-000000000001",
            product_name: "Floral Anarkali Kurta",
            size_label: "M",
            color: "Rose",
            qty: 1,
            price: 129900,
            exchange_for_size: "M",
            exchange_for_price: 159900,
            retail_products: { slug: "floral-anarkali-kurta" },
            exchange_product: { slug: "embroidered-chikankari-kurti" },
          },
        ],
      })
    );

    expect(request.items[0].exchangeForProductId).toBe("embroidered-chikankari-kurti");
    // Swapped up, so the customer owes the difference.
    expect(exchangeBalance(request)).toBe(30000);
  });

  it("carries the decision note both ways", () => {
    expect(toReturnRequest(row()).decisionNote).toBeUndefined();
    expect(
      toReturnRequest(row({ decision_note: "Rejected — worn beyond resale." })).decisionNote
    ).toBe("Rejected — worn beyond resale.");
  });

  it("survives a return whose order embed is missing", () => {
    // Should not happen — order_id is NOT NULL — but a mapping that throws
    // would take down the whole queue rather than one row.
    expect(toReturnRequest(row({ retail_orders: null })).orderId).toBe("");
  });

  it("translates the stored code back into the reason the app knows", () => {
    // The bug this exists for: `row.reason as ReturnReason` type-checks and
    // yields "size_or_fit", which is not one of the app's reasons and so never
    // matches RESTOCKABLE_REASONS — meaning nothing is ever put back on the
    // shelf and no back-in-stock alert ever fires, silently.
    const request = toReturnRequest(row());
    expect(request.reason).toBe("Size or fit issue");
    expect(isRestockable(request.reason)).toBe(true);
  });

  it("keeps a non-restockable reason non-restockable", () => {
    const request = toReturnRequest(row({ reason: "damaged_or_defective" }));
    expect(request.reason).toBe("Item damaged or defective");
    // A damaged garment must not be quietly re-sold to the next customer.
    expect(isRestockable(request.reason)).toBe(false);
  });
});

describe("reason translation", () => {
  it("round-trips every reason the app offers", () => {
    // Both directions, for every value: a reason that survives one way but not
    // the other is a return that either cannot be filed or cannot be read.
    for (const reason of RETURN_REASONS) {
      expect(reasonFromCode(reasonToCode(reason))).toBe(reason);
    }
  });

  it("gives every reason a distinct code", () => {
    // Two reasons sharing a code would make the round trip lossy in a way the
    // test above would not catch for the reason that lost.
    const codes = RETURN_REASONS.map(reasonToCode);
    expect(new Set(codes).size).toBe(RETURN_REASONS.length);
  });

  it("fails an unknown code towards leaving goods off the shelf", () => {
    // If the enum grows and the app is not rebuilt, the fallback decides
    // whether an unrecognised return is re-sold. It must not be.
    expect(isRestockable(reasonFromCode("some_future_reason"))).toBe(false);
  });
});
