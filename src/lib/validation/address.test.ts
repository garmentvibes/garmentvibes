import { describe, expect, it } from "vitest";
import { normalisePhone, phoneField, pincodeField } from "./address";

const pin = (value: string) => pincodeField.safeParse(value).success;
const phone = (value: string) => phoneField.safeParse(value).success;

describe("pincodeField", () => {
  it("accepts a six-digit PIN code", () => {
    for (const value of ["500001", "110001", "400001", "781001"]) {
      expect(pin(value)).toBe(true);
    }
  });

  // The reason this exists. `min(4)` accepted all of these, and
  // estimateDelivery() then returned null, which codAvailability() reads as
  // "still typing" and offers COD regardless of the remote-area rule.
  it("rejects the short codes the old min(4) rule let through", () => {
    for (const value of ["5000", "50000", "1100"]) {
      expect(pin(value)).toBe(false);
    }
  });

  it("rejects a seven-digit code", () => {
    expect(pin("5000012")).toBe(false);
  });

  it("rejects letters and punctuation", () => {
    for (const value of ["50000A", "500-01", "abcdef", ""]) {
      expect(pin(value)).toBe(false);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(pin("  500001  ")).toBe(true);
  });
});

describe("phoneField", () => {
  it("accepts a plain ten-digit mobile", () => {
    for (const value of ["9876543210", "6000000000", "7123456789", "8888888888"]) {
      expect(phone(value)).toBe(true);
    }
  });

  it("accepts the prefixes people actually type", () => {
    for (const value of ["+919876543210", "919876543210", "09876543210"]) {
      expect(phone(value)).toBe(true);
    }
  });

  it("accepts spacing and hyphens rather than making the customer delete them", () => {
    for (const value of ["98765 43210", "98765-43210", "+91 98765 43210"]) {
      expect(phone(value)).toBe(true);
    }
  });

  // Indian mobile numbers start 6-9. A number starting 1-5 is a landline or
  // not a number at all, and cannot receive the delivery SMS.
  it("rejects a number that does not start in the mobile range", () => {
    for (const value of ["1234567890", "5876543210", "0123456789"]) {
      expect(phone(value)).toBe(false);
    }
  });

  it("rejects the ten-character junk the old min(10) rule let through", () => {
    for (const value of ["aaaaaaaaaa", "0000000000", "123456789012345"]) {
      expect(phone(value)).toBe(false);
    }
  });

  it("rejects a number that is too short", () => {
    expect(phone("987654321")).toBe(false);
  });
});

describe("normalisePhone", () => {
  it("reduces every way of writing one number to the same ten digits", () => {
    for (const value of ["+919876543210", "919876543210", "09876543210", "98765 43210"]) {
      expect(normalisePhone(value)).toBe("9876543210");
    }
  });
});
