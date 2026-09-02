import { describe, expect, it } from "vitest";

import { slugsFromRows, type StoredWishlistRow } from "./rows";
import { decideSync } from "@/lib/sync/decide";

describe("slugsFromRows", () => {
  it("lifts the slug out of each embedded product", () => {
    const rows: StoredWishlistRow[] = [
      { retail_products: { slug: "cotton-kurta" } },
      { retail_products: { slug: "linen-shirt" } },
    ];
    expect(slugsFromRows(rows)).toEqual(["cotton-kurta", "linen-shirt"]);
  });

  it("reads an empty wishlist as an empty list", () => {
    expect(slugsFromRows([])).toEqual([]);
  });

  // The failure this function exists to make visible. Its answer replaces the
  // customer's local wishlist, so a mapping that quietly returns nothing does
  // not read as "we could not fetch it" — it reads as "you have saved
  // nothing", and every heart on screen goes out.
  it("drops a row whose product did not come back, and keeps the rest", () => {
    const rows: StoredWishlistRow[] = [
      { retail_products: { slug: "cotton-kurta" } },
      { retail_products: null },
      { retail_products: { slug: "linen-shirt" } },
    ];
    expect(slugsFromRows(rows)).toEqual(["cotton-kurta", "linen-shirt"]);
  });

  it("drops an empty slug rather than passing one on", () => {
    // A slug of "" would go into the store, match no product in the catalogue,
    // and render as a heart on nothing.
    const rows: StoredWishlistRow[] = [{ retail_products: { slug: "" } }];
    expect(slugsFromRows(rows)).toEqual([]);
  });
});

// The sync rule is shared with the cart and tested in full over there. What is
// worth restating here is that the wishlist reaches the same three answers,
// because it is the reason there is one copy of the rule rather than two.
describe("the wishlist's use of the shared sync rule", () => {
  it("merges a signed-out list on a device that has never reconciled", () => {
    expect(
      decideSync({
        localCount: 3,
        syncedFor: undefined,
        customerKey: "asha@example.com",
      })
    ).toBe("merge");
  });

  // The un-hearting case. Without this, removing something on a phone would
  // have it put back by the next load on a laptop that still held it.
  it("adopts on a device that has already reconciled with this customer", () => {
    expect(
      decideSync({
        localCount: 3,
        syncedFor: "asha@example.com",
        customerKey: "asha@example.com",
      })
    ).toBe("adopt");
  });

  // The shared-browser case: one person's saved items must not appear on
  // another's list.
  it("adopts when the last customer on this device was somebody else", () => {
    expect(
      decideSync({
        localCount: 3,
        syncedFor: "bhavna@example.com",
        customerKey: "asha@example.com",
      })
    ).toBe("adopt");
  });

  it("adopts when there is nothing local to contribute", () => {
    expect(
      decideSync({
        localCount: 0,
        syncedFor: undefined,
        customerKey: "asha@example.com",
      })
    ).toBe("adopt");
  });
});
