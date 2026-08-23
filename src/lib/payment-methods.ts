import { estimateDelivery } from "@/lib/delivery-estimate";

// ---------------------------------------------------------------------------
// Which payment methods a given basket may use.
//
// The storefront used to offer exactly two things: "Pay Online" and "Cash on
// Delivery". Every Indian retailer of any size instead shows UPI, cards, net
// banking, wallets and EMI as siblings, because they are not interchangeable
// to the customer — UPI is the majority of Indian D2C payments and burying it
// one tap deeper costs conversions.
//
// Razorpay's Checkout collects the actual instrument; what this decides is
// which options to SHOW, which to disable and why, and which method to
// preselect inside Razorpay's modal so the customer lands where they chose.
//
// Kept as pure functions with no React and no gateway calls so the rules are
// unit-testable, which matters more here than usual: "COD was offered on an
// order we cannot collect on" is a loss that shows up weeks later as an RTO.
// ---------------------------------------------------------------------------

export type PaymentMethodId = "upi" | "card" | "netbanking" | "wallet" | "emi" | "cod";

/** The subset Razorpay Checkout accepts for `prefill.method`. */
export type RazorpayMethod = Exclude<PaymentMethodId, "cod">;

export interface PaymentMethodOption {
  id: PaymentMethodId;
  label: string;
  description: string;
  available: boolean;
  /** Present only when `available` is false. Shown to the customer. */
  unavailableReason?: string;
  /** Charged on top of the order for choosing this method, in minor units. */
  fee: number;
}

// ---------------------------------------------------------------------------
// POLICY — these are placeholders, not decisions.
//
// Every number below is a commercial call that belongs to the business, and
// each is a guess chosen to be defensible rather than researched. Confirm all
// four before taking real orders; they are gathered here rather than scattered
// through the UI so that confirming them is a single edit.
// ---------------------------------------------------------------------------
export const PAYMENT_POLICY = {
  /**
   * Above this, COD is refused. A cash-on-delivery order that is refused at
   * the door costs the full round trip plus the tied-up stock, and that risk
   * scales with the value of the parcel.
   */
  codMaxOrderValue: 1_500_000, // ₹15,000

  /**
   * Flat COD handling charge. Covers the courier's cash-collection fee, which
   * is real money the online methods do not cost us.
   *
   * OPEN QUESTION for the CA, alongside the rate slabs: a COD handling charge
   * is a service and carries its own GST rate, not the garment's. The
   * checkout summary therefore reports GST on the items only and shows this
   * as a separate line, rather than blending the two into one wrong number.
   * Settle the treatment before issuing invoices that include it.
   */
  codFee: 4_900, // ₹49

  /** Orders at or above this carry no COD fee — the margin absorbs it. */
  codFeeWaivedAbove: 200_000, // ₹2,000

  /**
   * Card EMI has a floor set by the issuing banks. ₹3,000 is the common one;
   * showing EMI below it means offering something the gateway will refuse.
   */
  emiMinOrderValue: 300_000, // ₹3,000
} as const;

export interface PaymentMethodInput {
  /** Order value after any discount, in minor units. */
  total: number;
  /** Delivery PIN code. An empty or partial code leaves COD undecided. */
  pincode: string;
  /** False when no Razorpay keys are configured on this deployment. */
  gatewayConfigured: boolean;
  /**
   * True when the applied promo code is one the payment route cannot price.
   *
   * The gateway is charged an amount the server computes, and the server can
   * only price the built-in codes — not ones created in the admin panel, and
   * not referral codes. Quoting a discount the gateway will not apply is how
   * a customer gets shown ₹1,039.20 and charged ₹1,299.
   *
   * So rather than dropping their discount or overcharging them, the online
   * methods withdraw and COD stays: cash on delivery collects the figure on
   * the screen, whatever produced it. The customer keeps the code, or removes
   * it and pays online.
   */
  promoBlocksOnline?: boolean;
}

/**
 * The online methods, in the order they should be shown.
 *
 * UPI first and deliberately so: it is how most Indian customers pay, and the
 * default option is the one most people take.
 */
const ONLINE_METHODS: Array<{ id: RazorpayMethod; label: string; description: string }> = [
  { id: "upi", label: "UPI", description: "GPay, PhonePe, Paytm, any UPI app" },
  { id: "card", label: "Credit / Debit Card", description: "Visa, Mastercard, RuPay, Amex" },
  { id: "netbanking", label: "Net Banking", description: "All major Indian banks" },
  { id: "wallet", label: "Wallet", description: "Paytm, PhonePe, Amazon Pay and others" },
  { id: "emi", label: "EMI", description: "Pay in instalments on your card" },
];

/**
 * COD's handling fee for a given order value. Exported because the order
 * summary has to show it as a line, and recomputing the rule there would let
 * the two disagree.
 */
export function codFee(total: number): number {
  return total >= PAYMENT_POLICY.codFeeWaivedAbove ? 0 : PAYMENT_POLICY.codFee;
}

/**
 * Whether cash on delivery can be offered, and if not, what to tell the
 * customer.
 *
 * The PIN code check reuses `estimateDelivery`, which already knows that the
 * longest lanes carry no COD. That was previously only consulted on the
 * product page, so a customer in a remote area was told COD was unavailable
 * while browsing and then offered it at checkout anyway.
 */
export function codAvailability(input: {
  total: number;
  pincode: string;
}): { available: boolean; reason?: string } {
  if (input.total > PAYMENT_POLICY.codMaxOrderValue) {
    return {
      available: false,
      reason: `Not available on orders above ₹${(PAYMENT_POLICY.codMaxOrderValue / 100).toLocaleString("en-IN")}`,
    };
  }

  const estimate = estimateDelivery(input.pincode);

  // An incomplete PIN code is not a refusal — the customer is still typing.
  // Offer COD and let the check bite once there is something to check.
  if (!estimate) return { available: true };

  if (!estimate.codAvailable) {
    return { available: false, reason: `Not available for delivery to ${estimate.region}` };
  }

  return { available: true };
}

/**
 * Every method with its availability resolved, in display order.
 *
 * Unavailable methods are returned rather than filtered out, because "COD is
 * not available above ₹15,000" is information the customer needs; silently
 * dropping the option invites them to wonder whether the site is broken.
 */
export function paymentMethods(input: PaymentMethodInput): PaymentMethodOption[] {
  const online: PaymentMethodOption[] = ONLINE_METHODS.map((method) => {
    if (input.promoBlocksOnline) {
      return {
        ...method,
        available: false,
        unavailableReason: "Not available with this discount code — pay on delivery instead",
        fee: 0,
      };
    }
    if (method.id === "emi" && input.total < PAYMENT_POLICY.emiMinOrderValue) {
      return {
        ...method,
        available: false,
        unavailableReason: `Available on orders above ₹${(PAYMENT_POLICY.emiMinOrderValue / 100).toLocaleString("en-IN")}`,
        fee: 0,
      };
    }
    return { ...method, available: true, fee: 0 };
  });

  const cod = codAvailability({ total: input.total, pincode: input.pincode });

  return [
    ...online,
    {
      id: "cod",
      label: "Cash on Delivery",
      description: "Pay the delivery agent when your order arrives",
      available: cod.available,
      unavailableReason: cod.reason,
      fee: cod.available ? codFee(input.total) : 0,
    },
  ];
}

/**
 * Picks a method to start on, given what is currently selectable.
 *
 * Called whenever availability changes — typing a remote PIN code while COD is
 * selected has to move the selection somewhere valid, or the customer submits
 * an order using a method the site has just said it cannot accept.
 */
export function resolveSelection(
  options: PaymentMethodOption[],
  current: PaymentMethodId | null
): PaymentMethodId {
  const chosen = options.find((option) => option.id === current);
  if (chosen?.available) return chosen.id;

  const firstAvailable = options.find((option) => option.available);
  // ONLINE_METHODS is never empty and its first entry is never conditionally
  // unavailable, so this fallback is unreachable in practice — it exists so
  // the return type is honest rather than an assertion.
  return firstAvailable?.id ?? "upi";
}

/** What to hand Razorpay as `prefill.method`. Null for COD. */
export function razorpayMethod(id: PaymentMethodId): RazorpayMethod | null {
  return id === "cod" ? null : id;
}

/** The amount actually charged, including any method fee. */
export function totalWithFee(total: number, method: PaymentMethodId): number {
  return method === "cod" ? total + codFee(total) : total;
}
