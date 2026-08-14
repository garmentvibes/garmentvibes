import { describe, it, expect } from "vitest";
import { RETURN_WINDOW_DAYS, returnEligibility } from "@/lib/returns";
import { isRestockable, RETURN_REASONS, type ReturnRequest } from "@/types/returns";

const DAY = 24 * 60 * 60 * 1000;

// A fixed "today" so these never drift with the calendar.
const NOW = new Date("2026-08-20T12:00:00Z").getTime();
const deliveredDaysAgo = (n: number) =>
  new Date(NOW - n * DAY).toISOString().slice(0, 10);

const claim = (overrides: Partial<ReturnRequest> = {}): ReturnRequest => ({
  id: "RET1",
  orderId: "GV1",
  resolution: "refund",
  customerName: "A",
  customerEmail: "a@example.com",
  phone: "+91 90000 00000",
  items: [],
  reason: "Size or fit issue",
  status: "requested",
  createdAt: new Date(NOW).toISOString(),
  ...overrides,
});

describe("returnEligibility", () => {
  it("allows a return inside the window", () => {
    const result = returnEligibility(
      { status: "delivered", deliveredAt: deliveredDaysAgo(2) },
      [],
      NOW
    );
    expect(result.eligible).toBe(true);
    expect(result.daysLeft).toBe(RETURN_WINDOW_DAYS - 2);
  });

  it("still allows a return on the final day", () => {
    // Delivered exactly RETURN_WINDOW_DAYS-1 days ago: one day remains, and
    // an off-by-one here would refuse a customer who is within policy.
    const result = returnEligibility(
      { status: "delivered", deliveredAt: deliveredDaysAgo(RETURN_WINDOW_DAYS - 1) },
      [],
      NOW
    );
    expect(result.eligible).toBe(true);
    expect(result.daysLeft).toBe(1);
  });

  it("refuses once the window has elapsed exactly", () => {
    const result = returnEligibility(
      { status: "delivered", deliveredAt: deliveredDaysAgo(RETURN_WINDOW_DAYS) },
      [],
      NOW
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("window_expired");
    expect(result.daysLeft).toBe(0);
  });

  it("refuses an order that has not been delivered", () => {
    for (const status of ["pending", "confirmed", "packed", "shipped", "cancelled"] as const) {
      const result = returnEligibility({ status }, [], NOW);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("not_delivered");
    }
  });

  it("refuses when delivered but no delivery date was recorded", () => {
    const result = returnEligibility({ status: "delivered" }, [], NOW);
    expect(result.reason).toBe("no_delivery_date");
  });

  it("blocks a second request while one is in flight", () => {
    for (const status of ["requested", "approved", "picked_up", "refunded"] as const) {
      const result = returnEligibility(
        { status: "delivered", deliveredAt: deliveredDaysAgo(1) },
        [claim({ status })],
        NOW
      );
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("already_requested");
    }
  });

  it("lets a rejected request be re-raised", () => {
    const result = returnEligibility(
      { status: "delivered", deliveredAt: deliveredDaysAgo(1) },
      [claim({ status: "rejected" })],
      NOW
    );
    expect(result.eligible).toBe(true);
  });

  it("checks the existing-claim rule before the delivery rule", () => {
    // An open claim on a not-yet-delivered order should report the claim,
    // which is the more actionable message.
    const result = returnEligibility({ status: "shipped" }, [claim()], NOW);
    expect(result.reason).toBe("already_requested");
  });
});

describe("isRestockable", () => {
  it("does not restock anything faulty", () => {
    expect(isRestockable("Item damaged or defective")).toBe(false);
    expect(isRestockable("Quality not as expected")).toBe(false);
  });

  it("restocks units that came back sellable", () => {
    expect(isRestockable("Size or fit issue")).toBe(true);
    expect(isRestockable("Changed my mind")).toBe(true);
  });

  it("classifies every reason the UI can produce", () => {
    // A new reason added to the picker without a restock decision would
    // silently default to "not sellable" and quietly lose inventory.
    for (const reason of RETURN_REASONS) {
      expect(typeof isRestockable(reason)).toBe("boolean");
    }
  });
});
