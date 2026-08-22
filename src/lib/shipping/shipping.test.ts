import { describe, expect, it } from "vitest";

import { AWB_FORMATS, checkAwb, normaliseAwb } from "./awb";
import { interpretCourierStatus, normaliseStatus, statusFromCourier } from "./status";
import { COURIERS } from "@/lib/couriers";

describe("normaliseAwb", () => {
  // Couriers print spaces and hyphens into their own labels for legibility, so
  // a number copied off one arrives with them.
  it("strips the formatting couriers print on their labels", () => {
    expect(normaliseAwb("  ee 1234-5678 9in  ")).toBe("EE123456789IN");
  });
});

describe("checkAwb", () => {
  it("accepts a well-formed number for each courier we know", () => {
    const valid: Record<string, string> = {
      delhivery: "12345678901",
      bluedart: "12345678901",
      dtdc: "D12345678",
      ekart: "FMPC1234567890",
      indiapost: "EE123456789IN",
    };
    for (const [courierId, awb] of Object.entries(valid)) {
      expect(checkAwb(courierId, awb), courierId).toMatchObject({ valid: true });
    }
  });

  it("rejects an empty value", () => {
    expect(checkAwb("delhivery", "   ")).toMatchObject({ valid: false });
  });

  // The failure this exists to prevent: a short or mistyped number goes into
  // a shipment email as a tracking link that 404s.
  it("rejects a number that is too short for its courier", () => {
    const result = checkAwb("delhivery", "12345");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/11–14 digits/);
  });

  it("rejects letters where the courier issues digits", () => {
    expect(checkAwb("bluedart", "ABCDEFGHIJK").valid).toBe(false);
  });

  it("rejects an India Post number missing its country suffix", () => {
    expect(checkAwb("indiapost", "EE123456789").valid).toBe(false);
    expect(checkAwb("indiapost", "EE123456789IN").valid).toBe(true);
  });

  it("normalises before validating, so a label-formatted number passes", () => {
    const result = checkAwb("indiapost", "EE 1234 5678 9IN");
    expect(result.valid).toBe(true);
    expect(result.normalised).toBe("EE123456789IN");
  });

  it("returns the normalised value even when it rejects", () => {
    expect(checkAwb("delhivery", " 123 ").normalised).toBe("123");
  });

  // A courier with no entry in the table is a gap here, not an invalid parcel.
  // Blocking dispatch over it would make adding a carrier a breaking change.
  it("accepts anything non-empty for a courier it has no format for", () => {
    expect(checkAwb("some-new-courier", "whatever-123").valid).toBe(true);
    expect(checkAwb(undefined, "whatever-123").valid).toBe(true);
  });

  it("has a format for every courier the app offers", () => {
    for (const courier of COURIERS) {
      expect(AWB_FORMATS[courier.id], `missing AWB format for ${courier.id}`).toBeDefined();
    }
  });
});

describe("normaliseStatus", () => {
  it("collapses the separators different carriers use", () => {
    expect(normaliseStatus("out_for-delivery")).toBe("OUT FOR DELIVERY");
    expect(normaliseStatus("  In   Transit ")).toBe("IN TRANSIT");
  });
});

describe("interpretCourierStatus", () => {
  it("maps the ordinary progression", () => {
    expect(statusFromCourier("Order Created")).toBe("confirmed");
    expect(statusFromCourier("Pickup Scheduled")).toBe("packed");
    expect(statusFromCourier("In Transit")).toBe("shipped");
    expect(statusFromCourier("Out for Delivery")).toBe("shipped");
    expect(statusFromCourier("Delivered")).toBe("delivered");
  });

  // Ordering bugs in the rule table are the whole risk here: every failure
  // phrase contains a word that also appears in a success phrase.
  it("does not read a failed attempt as a delivery", () => {
    expect(interpretCourierStatus("Not Delivered")).toMatchObject({ kind: "attention" });
    expect(interpretCourierStatus("UNDELIVERED")).toMatchObject({ kind: "attention" });
    expect(interpretCourierStatus("Delivery Failed")).toMatchObject({ kind: "attention" });
  });

  it("does not read out-for-delivery as delivered", () => {
    expect(statusFromCourier("OUT FOR DELIVERY")).toBe("shipped");
  });

  // An RTO is a failed delivery needing a human decision, not a transition.
  it("surfaces a return to origin rather than filing it as a status", () => {
    expect(interpretCourierStatus("RTO Initiated")).toMatchObject({ kind: "rto" });
    expect(interpretCourierStatus("Returned to Origin")).toMatchObject({ kind: "rto" });
    expect(statusFromCourier("RTO Delivered")).toBeNull();
  });

  it("flags lost and damaged parcels for a person", () => {
    expect(interpretCourierStatus("Shipment Lost")).toMatchObject({ kind: "attention" });
    expect(interpretCourierStatus("Damaged in transit")).toMatchObject({ kind: "attention" });
  });

  it("handles both spellings of cancelled", () => {
    expect(statusFromCourier("Canceled")).toBe("cancelled");
    expect(statusFromCourier("CANCELLED")).toBe("cancelled");
  });

  // Falling through to "no change" would be indistinguishable from a parcel
  // that has not moved, which is the case nobody investigates.
  it("reports an unrecognised status instead of guessing", () => {
    expect(interpretCourierStatus("Held at customs pending inspection")).toMatchObject({
      kind: "unknown",
    });
    expect(interpretCourierStatus("")).toMatchObject({ kind: "unknown" });
  });

  it("never returns an order status for anything needing a human", () => {
    for (const raw of ["RTO Initiated", "Not Delivered", "Shipment Lost", "who knows"]) {
      expect(statusFromCourier(raw), raw).toBeNull();
    }
  });
});
