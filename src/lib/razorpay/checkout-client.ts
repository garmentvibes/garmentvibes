// Browser-side Razorpay Checkout handoff.
//
// Kept out of the checkout component so the component stays about the order
// and this stays about the gateway. Nothing here runs unless the server has
// confirmed Razorpay is configured.

export interface RazorpayHandoff {
  orderId: string;
  amount: number;
  currency: string;
  receipt: string;
}

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

// Razorpay's script attaches a constructor to window; this is the slice of
// it we use, typed rather than reaching through `any`.
interface RazorpayConstructor {
  new (options: Record<string, unknown>): { open: () => void };
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Loads Razorpay's script once, reusing it across checkout attempts. */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/** Asks the server to create an order. Null means "fall back to simulated". */
export async function createPaymentOrder(input: {
  items: Array<{ productId: string; qty: number }>;
  promoCode?: string;
}): Promise<RazorpayHandoff | null> {
  const response = await fetch("/api/razorpay/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (response.status === 503) return null; // not configured
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.message ?? "Could not start the payment");
  }
  return (await response.json()) as RazorpayHandoff;
}

/**
 * Opens Razorpay Checkout and resolves once the server has verified the
 * result. Resolves false when the customer dismisses the modal.
 *
 * The success path deliberately does not trust the browser's word: the
 * response goes back to /api/razorpay/verify, which checks the signature
 * and re-reads the payment from Razorpay.
 */
export function openRazorpayCheckout(options: {
  keyId: string;
  handoff: RazorpayHandoff;
  customer: { name: string; email: string; contact: string };
}): Promise<{ paid: boolean; paymentId?: string }> {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error("Razorpay checkout script did not load"));
      return;
    }

    const checkout = new window.Razorpay({
      key: options.keyId,
      order_id: options.handoff.orderId,
      amount: options.handoff.amount,
      currency: options.handoff.currency,
      name: "GarmentVibes",
      description: `Order ${options.handoff.receipt}`,
      prefill: {
        name: options.customer.name,
        email: options.customer.email,
        contact: options.customer.contact,
      },
      theme: { color: "#e11d48" },
      modal: {
        ondismiss: () => resolve({ paid: false }),
      },
      handler: async (response: RazorpayCheckoutResponse) => {
        try {
          const verifyResponse = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const result = await verifyResponse.json();
          resolve({
            paid: Boolean(result.verified && result.paid),
            paymentId: response.razorpay_payment_id,
          });
        } catch (error) {
          reject(error);
        }
      },
    });

    checkout.open();
  });
}
