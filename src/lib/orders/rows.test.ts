import { describe, expect, it } from "vitest";

import { formatAddress, toRetailOrder, type OrderRow } from "./rows";

// ---------------------------------------------------------------------------
// The mapping both order readers share.
//
// Worth testing on its own now that there are two of them — a customer reading
// their own orders and staff reading everyone's to fulfil them. The failure
// this guards against is not a crash: it is the admin panel and the customer's
// own page quoting different things at each other over the phone.
// ---------------------------------------------------------------------------

function row(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "0f7d2c1e-0000-0000-0000-000000000001",
    reference: "GV-1042",
    status: "confirmed",
    created_at: "2026-08-20T11:04:22.000Z",
    delivered_at: null,
    shipped_at: null,
    courier_id: null,
    awb: null,
    customer_name: "Aditi Rao",
    customer_email: "aditi@example.com",
    phone: "+919876543210",
    shipping_address: {
      addressLine1: "12 Rose Lane",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
    },
    payment_method: "upi",
    retail_order_items: [
      {
        product_id: "floral-anarkali-kurta",
        product_name: "Floral Anarkali Kurta",
        size: "M",
        color: "Rose",
        qty: 2,
        price: 129900,
      },
    ],
    ...overrides,
  };
}

describe("toRetailOrder", () => {
  it("identifies the order by its reference, not its uuid", () => {
    // The reference is what the customer was shown and what Razorpay holds.
    // A uuid in the URL means support and the customer quoting different
    // numbers at each other.
    expect(toRetailOrder(row()).id).toBe("GV-1042");
  });

  it("falls back to the uuid when there is no reference", () => {
    // Orders predating the reference column still have to be openable.
    const order = toRetailOrder(row({ reference: null }));
    expect(order.id).toBe("0f7d2c1e-0000-0000-0000-000000000001");
  });

  it("keeps the name the product had when it was bought", () => {
    // The whole reason the name is snapshotted on the line: renaming a product
    // must not change what a past order says it was for.
    const order = toRetailOrder(row());
    expect(order.items[0].name).toBe("Floral Anarkali Kurta");
  });

  it("falls back to the product id when the snapshot is missing", () => {
    const order = toRetailOrder(row({
      retail_order_items: [
        { product_id: "floral-anarkali-kurta", product_name: null, size: "M", color: "Rose", qty: 1, price: 129900 },
      ],
    }));

    expect(order.items[0].name).toBe("floral-anarkali-kurta");
  });

  it("collapses every online payment method to 'online'", () => {
    // 0012 grew the stored enum to six. upi/card/netbanking/wallet/emi are a
    // reconciliation detail, not something to print on an order card.
    for (const method of ["upi", "card", "netbanking", "wallet", "emi", "online"]) {
      expect(toRetailOrder(row({ payment_method: method })).paymentMethod).toBe("online");
    }
  });

  it("keeps cash on delivery distinct, because it changes what happens", () => {
    expect(toRetailOrder(row({ payment_method: "cod" })).paymentMethod).toBe("cod");
  });

  it("reports a shipment only when all three parts are there", () => {
    // A tracking link built from a courier with no AWB goes nowhere, which
    // reads to the customer as a lost parcel.
    expect(toRetailOrder(row({ courier_id: "delhivery" })).shipment).toBeUndefined();
    expect(toRetailOrder(row({ courier_id: "delhivery", awb: "123" })).shipment).toBeUndefined();

    const shipped = toRetailOrder(
      row({ courier_id: "delhivery", awb: "123", shipped_at: "2026-08-22" })
    );
    expect(shipped.shipment).toEqual({
      courierId: "delhivery",
      awb: "123",
      shippedAt: "2026-08-22",
    });
  });

  it("survives an order with no items", () => {
    // PostgREST omits an empty embedded array in some shapes, and an order
    // detail page that throws is worse than one showing an empty basket.
    const order = toRetailOrder(
      row({ retail_order_items: undefined as unknown as OrderRow["retail_order_items"] })
    );
    expect(order.items).toEqual([]);
  });

  it("takes the placed date from the timestamp, without the time", () => {
    expect(toRetailOrder(row()).placedAt).toBe("2026-08-20");
  });
});

describe("formatAddress", () => {
  it("joins the parts the UI prints", () => {
    expect(formatAddress(row().shipping_address)).toBe(
      "12 Rose Lane, Hyderabad, Telangana, 500081"
    );
  });

  it("accepts the older line1 spelling", () => {
    // Addresses were stored under `line1` before `addressLine1`, and an order
    // placed then still has to render its address rather than a blank.
    expect(formatAddress({ line1: "9 Mint Street", city: "Chennai" })).toBe(
      "9 Mint Street, Chennai"
    );
  });

  it("skips missing parts rather than leaving empty commas", () => {
    expect(formatAddress({ city: "Pune", pincode: "411001" })).toBe("Pune, 411001");
  });

  it("returns nothing for a missing address", () => {
    expect(formatAddress(null)).toBe("");
  });
});
