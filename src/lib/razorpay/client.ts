import { RAZORPAY_API_BASE, razorpayKeyId, razorpayKeySecret } from "@/lib/razorpay/config";

// Thin wrapper over the Razorpay REST API.
//
// Plain fetch rather than the official SDK: the surface we need is two
// endpoints, and keeping it transparent means the request being sent is
// visible in this file rather than behind a dependency we cannot exercise
// until real keys exist.

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
  receipt?: string;
  status: string;
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

function authHeader() {
  const secret = razorpayKeySecret();
  if (!secret) throw new RazorpayError("Razorpay is not configured", 503);
  // Razorpay authenticates with HTTP Basic: key_id as user, secret as password.
  return `Basic ${Buffer.from(`${razorpayKeyId()}:${secret}`).toString("base64")}`;
}

/**
 * Creates a Razorpay order. `amount` is in paise, which is what the app
 * stores natively — no conversion, and therefore no rounding, in between.
 *
 * `receipt` is our own order reference; Razorpay echoes it back on webhooks,
 * which is how a payment is later tied to an order in our system.
 */
export async function createRazorpayOrder(input: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify({
      amount: input.amount,
      currency: "INR", // INR-only by product decision
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new RazorpayError(
      `Razorpay order creation failed (${response.status}): ${detail.slice(0, 300)}`,
      502
    );
  }

  return (await response.json()) as RazorpayOrder;
}

/** Fetches a payment, used to confirm state independently of the client. */
export async function fetchRazorpayPayment(paymentId: string) {
  const response = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!response.ok) {
    throw new RazorpayError(`Could not fetch payment ${paymentId}`, 502);
  }
  // `notes` is copied onto the payment from the order it belongs to, which is
  // how the receipt travels back to us — the browser's handoff carries the
  // gateway order id, and that is not something we can look an order up by.
  return (await response.json()) as {
    id: string;
    status: string;
    amount: number;
    order_id: string;
    notes?: Record<string, string>;
  };
}
