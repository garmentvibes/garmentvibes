import { describe, it, expect } from "vitest";
import {
  addDays,
  ageingBucket,
  amountOutstanding,
  amountPaid,
  daysOverdue,
  isOverdue,
  type CreditInvoice,
} from "@/types/credit";

const NOW = new Date("2026-08-20T12:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const dateOffset = (days: number) => new Date(NOW + days * DAY).toISOString().slice(0, 10);

const invoice = (overrides: Partial<CreditInvoice> = {}): CreditInvoice => ({
  id: "INV1",
  orderId: "GVQ1",
  accountId: "wa1",
  businessName: "Test Traders",
  contactName: "A",
  email: "a@example.com",
  amount: 100000,
  issuedOn: dateOffset(-40),
  dueOn: dateOffset(-10),
  payments: [],
  status: "open",
  ...overrides,
});

describe("amountPaid / amountOutstanding", () => {
  it("treats an unpaid invoice as fully outstanding", () => {
    expect(amountOutstanding(invoice())).toBe(100000);
  });

  it("sums multiple part payments", () => {
    const i = invoice({
      payments: [
        { id: "p1", amount: 30000, receivedOn: dateOffset(-5), method: "upi" },
        { id: "p2", amount: 20000, receivedOn: dateOffset(-2), method: "cheque" },
      ],
    });
    expect(amountPaid(i)).toBe(50000);
    expect(amountOutstanding(i)).toBe(50000);
  });

  it("never reports a negative balance when overpaid", () => {
    // Overpayment is refused at the UI, but the maths must not go negative
    // and quietly turn a debt into a credit if one ever gets through.
    const i = invoice({
      payments: [{ id: "p1", amount: 150000, receivedOn: dateOffset(-1), method: "upi" }],
    });
    expect(amountOutstanding(i)).toBe(0);
  });

  it("treats a written-off invoice as nothing outstanding", () => {
    expect(amountOutstanding(invoice({ status: "written_off" }))).toBe(0);
  });
});

describe("daysOverdue / isOverdue", () => {
  it("is zero on the due date itself", () => {
    // Due today is not yet late; an off-by-one here chases a customer a day
    // early, which is exactly the kind of thing that loses accounts.
    expect(daysOverdue(invoice({ dueOn: dateOffset(0) }), NOW)).toBe(0);
    expect(isOverdue(invoice({ dueOn: dateOffset(0) }), NOW)).toBe(false);
  });

  it("is negative while still within terms", () => {
    expect(daysOverdue(invoice({ dueOn: dateOffset(5) }), NOW)).toBeLessThan(0);
    expect(isOverdue(invoice({ dueOn: dateOffset(5) }), NOW)).toBe(false);
  });

  it("counts days once past due", () => {
    expect(daysOverdue(invoice({ dueOn: dateOffset(-3) }), NOW)).toBe(3);
    expect(isOverdue(invoice({ dueOn: dateOffset(-3) }), NOW)).toBe(true);
  });

  it("is not overdue once fully paid, however late the due date", () => {
    const i = invoice({
      dueOn: dateOffset(-90),
      payments: [{ id: "p1", amount: 100000, receivedOn: dateOffset(-80), method: "upi" }],
    });
    expect(isOverdue(i, NOW)).toBe(false);
  });

  it("is not overdue once written off", () => {
    expect(isOverdue(invoice({ dueOn: dateOffset(-200), status: "written_off" }), NOW)).toBe(false);
  });
});

describe("ageingBucket", () => {
  it("puts anything not yet due in current", () => {
    expect(ageingBucket(0)).toBe("current");
    expect(ageingBucket(-5)).toBe("current");
  });

  it("uses inclusive upper bounds at each boundary", () => {
    expect(ageingBucket(1)).toBe("1-30");
    expect(ageingBucket(30)).toBe("1-30");
    expect(ageingBucket(31)).toBe("31-60");
    expect(ageingBucket(60)).toBe("31-60");
    expect(ageingBucket(61)).toBe("61-90");
    expect(ageingBucket(90)).toBe("61-90");
    expect(ageingBucket(91)).toBe("90+");
  });
});

describe("addDays", () => {
  it("adds Net-30 terms to an issue date", () => {
    expect(addDays("2026-08-01", 30)).toBe("2026-08-31");
  });

  it("rolls across a month boundary", () => {
    expect(addDays("2026-08-15", 30)).toBe("2026-09-14");
  });

  it("handles a leap day without drifting", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});
