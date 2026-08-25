import { describe, expect, it } from "vitest";

import { planMessages, toE164 } from "./plan";
import { NOTIFICATION_TEMPLATES } from "./templates";

const CONTACT = {
  name: "Aditi Rao",
  email: "aditi@example.com",
  phone: "+91 98765 43210",
};

describe("toE164", () => {
  it("adds the country code to a bare ten-digit number", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
  });

  it("accepts the forms the checkout actually stores", () => {
    // PHONE_PATTERN allows +91, 91, a leading 0, or nothing, with spaces and
    // hyphens anywhere. All of them are one number.
    expect(toE164("+91 98765 43210")).toBe("+919876543210");
    expect(toE164("919876543210")).toBe("+919876543210");
    expect(toE164("09876543210")).toBe("+919876543210");
    expect(toE164("98765-43210")).toBe("+919876543210");
  });

  it("rejects a number that is not an Indian mobile", () => {
    // Landlines and short numbers cannot receive an SMS, and sending one to
    // MSG91 costs a message and returns a rejection.
    expect(toE164("1234567890")).toBeNull();
    expect(toE164("98765")).toBeNull();
  });

  it("rejects nothing at all", () => {
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe("planMessages", () => {
  it("plans one row per channel the template uses", () => {
    const messages = planMessages("order_placed", { name: "Aditi Rao" }, CONTACT);

    expect(messages.map((m) => m.channel)).toEqual(
      NOTIFICATION_TEMPLATES.order_placed.channels
    );
  });

  it("renders the copy at plan time, not at send time", () => {
    // 0009: rendered at enqueue time so staff read exactly what the customer
    // will receive, and a later copy change cannot rewrite a queued message.
    const [email] = planMessages(
      "order_placed",
      { name: "Aditi Rao", orderId: "GV-1001", amount: "₹2,499" },
      CONTACT
    );

    expect(email.subject).toBe("Order GV-1001 confirmed");
    expect(email.body).toContain("GV-1001");
    expect(email.body).toContain("₹2,499");
  });

  it("leaves the subject empty on channels that have none", () => {
    const sms = planMessages("order_placed", { name: "Aditi Rao" }, CONTACT).find(
      (m) => m.channel === "sms"
    );

    expect(sms?.subject).toBe("");
  });

  it("skips channels it has no address for", () => {
    // A customer with no phone number cannot be sent an SMS by any provider.
    // Queueing one would produce a row that fails five times and then sits in
    // the admin panel looking like a provider fault.
    const messages = planMessages("order_placed", { name: "Aditi Rao" }, {
      name: "Aditi Rao",
      email: "aditi@example.com",
      phone: null,
    });

    expect(messages.map((m) => m.channel)).toEqual(["email"]);
  });

  it("skips a phone that is not a valid mobile", () => {
    const messages = planMessages("order_placed", { name: "Aditi Rao" }, {
      ...CONTACT,
      phone: "not a number",
    });

    expect(messages.map((m) => m.channel)).toEqual(["email"]);
  });

  it("skips an email that is blank or malformed", () => {
    expect(
      planMessages("order_placed", { name: "A" }, { ...CONTACT, email: "  " })
        .map((m) => m.channel)
    ).toEqual(["sms", "whatsapp"]);

    expect(
      planMessages("order_placed", { name: "A" }, { ...CONTACT, email: "aditi example.com" })
        .map((m) => m.channel)
    ).toEqual(["sms", "whatsapp"]);
  });

  it("plans nothing when there is nobody to reach", () => {
    const messages = planMessages("order_placed", { name: "A" }, { name: "A" });
    expect(messages).toEqual([]);
  });

  it("normalises the phone into the recipient", () => {
    const sms = planMessages("order_placed", { name: "A" }, CONTACT).find(
      (m) => m.channel === "sms"
    );

    // Stored as the customer typed it; queued in the form a provider takes.
    expect(sms?.recipient).toBe("+919876543210");
  });

  it("keys each channel separately when a scope is given", () => {
    const messages = planMessages("order_placed", { name: "A" }, CONTACT, {
      dedupeScope: "order-uuid",
    });

    // The email and the SMS are two things that each happen once, not one
    // thing that happens twice — so they cannot share a key.
    expect(messages.map((m) => m.dedupe_key)).toEqual([
      "order_placed:email:order-uuid",
      "order_placed:sms:order-uuid",
      "order_placed:whatsapp:order-uuid",
    ]);
    expect(new Set(messages.map((m) => m.dedupe_key)).size).toBe(messages.length);
  });

  it("leaves the key null when no scope is given", () => {
    // Most templates are allowed to repeat: payment_overdue goes out on every
    // reminder, support_reply fires per reply. A key on those would swallow
    // the second one. See 0022.
    const messages = planMessages("payment_overdue", { name: "A" }, CONTACT);

    expect(messages.every((m) => m.dedupe_key === null)).toBe(true);
  });

  it("carries the cross-linking reference onto every row", () => {
    const messages = planMessages("order_placed", { name: "A" }, CONTACT, {
      relatedTo: "GV-1001",
    });

    expect(messages.every((m) => m.related_to === "GV-1001")).toBe(true);
  });
});
