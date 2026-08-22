import { describe, expect, it } from "vitest";

import {
  PAYMENT_POLICY,
  codAvailability,
  codFee,
  paymentMethods,
  razorpayMethod,
  resolveSelection,
  totalWithFee,
  type PaymentMethodId,
} from "./payment-methods";

const METRO = "400001"; // Mumbai — COD serviceable
const REMOTE = "790001"; // north-east — estimateDelivery marks COD unavailable
const STANDARD = "302001"; // Jaipur — standard lane

function ids(total: number, pincode: string, gatewayConfigured = true): PaymentMethodId[] {
  return paymentMethods({ total, pincode, gatewayConfigured })
    .filter((option) => option.available)
    .map((option) => option.id);
}

describe("online methods", () => {
  it("puts UPI first, because that is how most customers pay", () => {
    const options = paymentMethods({ total: 100_000, pincode: METRO, gatewayConfigured: true });
    expect(options[0].id).toBe("upi");
  });

  it("offers card, netbanking and wallet at any order value", () => {
    const small = ids(1_00, METRO);
    expect(small).toEqual(expect.arrayContaining(["upi", "card", "netbanking", "wallet"]));
  });

  it("returns every method rather than hiding the unavailable ones", () => {
    const options = paymentMethods({ total: 100, pincode: REMOTE, gatewayConfigured: true });
    expect(options.map((o) => o.id)).toEqual([
      "upi",
      "card",
      "netbanking",
      "wallet",
      "emi",
      "cod",
    ]);
  });
});

describe("EMI floor", () => {
  it("is unavailable below the bank minimum", () => {
    expect(ids(PAYMENT_POLICY.emiMinOrderValue - 1, METRO)).not.toContain("emi");
  });

  it("becomes available exactly at the minimum", () => {
    expect(ids(PAYMENT_POLICY.emiMinOrderValue, METRO)).toContain("emi");
  });

  it("explains why it is unavailable rather than just disabling it", () => {
    const emi = paymentMethods({ total: 1_000, pincode: METRO, gatewayConfigured: true }).find(
      (o) => o.id === "emi"
    );
    expect(emi?.available).toBe(false);
    expect(emi?.unavailableReason).toMatch(/3,000/);
  });
});

describe("COD availability", () => {
  it("is offered on a normal metro order", () => {
    expect(codAvailability({ total: 100_000, pincode: METRO }).available).toBe(true);
  });

  // The bug this module was written to fix: the product page consulted
  // estimateDelivery and said COD was unavailable, then checkout offered it.
  it("respects the same PIN code rule the delivery estimate uses", () => {
    const result = codAvailability({ total: 100_000, pincode: REMOTE });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/Remote area/);
  });

  it("is refused above the order-value ceiling", () => {
    const result = codAvailability({
      total: PAYMENT_POLICY.codMaxOrderValue + 1,
      pincode: METRO,
    });
    expect(result.available).toBe(false);
    expect(result.reason).toMatch(/15,000/);
  });

  it("is allowed exactly at the ceiling", () => {
    expect(
      codAvailability({ total: PAYMENT_POLICY.codMaxOrderValue, pincode: METRO }).available
    ).toBe(true);
  });

  // Refusing COD while someone is halfway through typing their PIN code would
  // make the option flicker out and back as they type.
  it("does not refuse on an incomplete PIN code", () => {
    expect(codAvailability({ total: 100_000, pincode: "" }).available).toBe(true);
    expect(codAvailability({ total: 100_000, pincode: "79" }).available).toBe(true);
  });

  it("applies the value ceiling even when the PIN code is unknown", () => {
    expect(
      codAvailability({ total: PAYMENT_POLICY.codMaxOrderValue + 1, pincode: "" }).available
    ).toBe(false);
  });
});

describe("COD fee", () => {
  it("is charged on small orders", () => {
    expect(codFee(50_000)).toBe(PAYMENT_POLICY.codFee);
  });

  it("is waived at and above the threshold", () => {
    expect(codFee(PAYMENT_POLICY.codFeeWaivedAbove)).toBe(0);
    expect(codFee(PAYMENT_POLICY.codFeeWaivedAbove + 1)).toBe(0);
  });

  it("is still charged one paisa below the threshold", () => {
    expect(codFee(PAYMENT_POLICY.codFeeWaivedAbove - 1)).toBe(PAYMENT_POLICY.codFee);
  });

  it("is added to the charged total only for COD", () => {
    expect(totalWithFee(50_000, "cod")).toBe(50_000 + PAYMENT_POLICY.codFee);
    expect(totalWithFee(50_000, "upi")).toBe(50_000);
  });

  it("is reported as zero on a method that cannot be used", () => {
    const cod = paymentMethods({ total: 50_000, pincode: REMOTE, gatewayConfigured: true }).find(
      (o) => o.id === "cod"
    );
    expect(cod?.available).toBe(false);
    expect(cod?.fee).toBe(0);
  });
});

describe("resolveSelection", () => {
  const options = (total: number, pincode: string) =>
    paymentMethods({ total, pincode, gatewayConfigured: true });

  it("keeps a selection that is still valid", () => {
    expect(resolveSelection(options(100_000, METRO), "cod")).toBe("cod");
  });

  it("defaults to UPI when nothing is selected", () => {
    expect(resolveSelection(options(100_000, METRO), null)).toBe("upi");
  });

  // Without this, typing a remote PIN code with COD selected would leave the
  // order pointing at a method the site has just refused.
  it("moves off a selection that has become unavailable", () => {
    expect(resolveSelection(options(100_000, REMOTE), "cod")).toBe("upi");
  });

  it("moves off EMI when the basket drops below the floor", () => {
    expect(resolveSelection(options(1_000, STANDARD), "emi")).toBe("upi");
  });
});

describe("razorpayMethod", () => {
  it("maps each online method to itself", () => {
    for (const id of ["upi", "card", "netbanking", "wallet", "emi"] as const) {
      expect(razorpayMethod(id)).toBe(id);
    }
  });

  it("has nothing to hand the gateway for COD", () => {
    expect(razorpayMethod("cod")).toBeNull();
  });
});
