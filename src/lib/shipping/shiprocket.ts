import "server-only";

import {
  SHIPROCKET_API_BASE,
  isShiprocketConfigured,
  shiprocketEmail,
  shiprocketPassword,
  shiprocketPickupLocation,
} from "./config";
import { checkAwb } from "./awb";
import type { BookingResult, ShipmentRequest, ShippingProvider } from "./types";

// ---------------------------------------------------------------------------
// Shiprocket adapter.
//
// READ THIS BEFORE THE FIRST REAL DISPATCH.
//
// This is written against Shiprocket's published v1 API and has never been run
// against a live account, because there is no account. It cannot fire without
// credentials — `configured` is false and `book()` refuses — so it is inert
// rather than dangerous, but "compiles and is typed" is not "works".
//
// The first booking must be supervised: create one real order, run it through,
// and check the AWB against Shiprocket's own dashboard before letting it near
// a customer. Expect at least one field name to be wrong. That is normal for
// an integration written from documentation, and it is exactly why the manual
// path is kept rather than deleted.
//
// Deliberately not implemented here: label printing, pickup scheduling, and
// NDR handling. Each needs the shipment id this returns, and writing three
// more unverified calls on top of an unverified one multiplies the guesswork
// rather than the value.
// ---------------------------------------------------------------------------

interface TokenResponse {
  token?: string;
  message?: string;
}

interface CreateOrderResponse {
  order_id?: number;
  shipment_id?: number;
  awb_code?: string | null;
  courier_name?: string | null;
  status?: string;
  message?: string;
  errors?: Record<string, string[]>;
}

// Tokens last ten days; this cache is per-process and deliberately simple,
// because a wrong answer here costs one extra login rather than a failed
// dispatch.
let cachedToken: { token: string; expiresAt: number } | null = null;
const TOKEN_TTL = 9 * 24 * 60 * 60 * 1000;

async function authenticate(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const response = await fetch(`${SHIPROCKET_API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: shiprocketEmail(), password: shiprocketPassword() }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as TokenResponse;
  if (!data.token) return null;

  cachedToken = { token: data.token, expiresAt: Date.now() + TOKEN_TTL };
  return data.token;
}

/** Shiprocket's courier names, mapped to the ids in lib/couriers.ts. */
function courierIdFromName(name: string | null | undefined): string {
  const lowered = (name ?? "").toLowerCase();
  if (lowered.includes("delhivery")) return "delhivery";
  if (lowered.includes("blue dart") || lowered.includes("bluedart")) return "bluedart";
  if (lowered.includes("dtdc")) return "dtdc";
  if (lowered.includes("ekart")) return "ekart";
  if (lowered.includes("india post") || lowered.includes("indiapost")) return "indiapost";
  // An unmapped carrier still ships. Returning empty means the tracking link
  // cannot be built, which shows as "no link" rather than a wrong one.
  return "";
}

/** Minor units to rupees — Shiprocket prices in whole rupees. */
function toRupees(minorUnits: number): number {
  return Math.round(minorUnits) / 100;
}

export const shiprocketProvider: ShippingProvider = {
  id: "shiprocket",

  get configured() {
    return isShiprocketConfigured();
  },

  async book(request: ShipmentRequest): Promise<BookingResult> {
    if (!isShiprocketConfigured()) {
      return { ok: false, error: "Shiprocket is not configured on this deployment" };
    }

    const token = await authenticate();
    if (!token) {
      return { ok: false, error: "Could not sign in to Shiprocket — check the credentials" };
    }

    const nameParts = request.customerName.trim().split(/\s+/);

    const payload = {
      order_id: request.orderId,
      order_date: new Date().toISOString().slice(0, 10),
      pickup_location: shiprocketPickupLocation(),
      billing_customer_name: nameParts[0] ?? request.customerName,
      // Shiprocket requires a last name field. An empty string is rejected, so
      // a single-name customer repeats their first name rather than failing to
      // be dispatched over a naming convention.
      billing_last_name: nameParts.slice(1).join(" ") || nameParts[0] || "",
      billing_address: request.addressLine1,
      billing_city: request.city,
      billing_pincode: request.pincode,
      billing_state: request.state,
      billing_country: "India",
      billing_email: request.email,
      billing_phone: request.phone,
      shipping_is_billing: true,
      order_items: request.items.map((item) => ({
        name: item.name,
        sku: item.sku,
        units: item.qty,
        selling_price: toRupees(item.price),
      })),
      payment_method: request.collectOnDelivery > 0 ? "COD" : "Prepaid",
      sub_total: toRupees(request.value),
      // Parcel dimensions. Placeholders sized for a folded garment carton —
      // these affect volumetric weight and therefore the bill, so measure a
      // real parcel and set them before running any volume through this.
      length: 30,
      breadth: 25,
      height: 8,
      weight: request.weightKg,
    };

    let response: Response;
    try {
      response = await fetch(`${SHIPROCKET_API_BASE}/orders/create/adhoc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    } catch {
      return { ok: false, error: "Could not reach Shiprocket" };
    }

    const data = (await response.json().catch(() => ({}))) as CreateOrderResponse;

    if (!response.ok) {
      // Field-level errors are the common failure and are far more useful than
      // the generic message, so they are surfaced rather than swallowed.
      const fieldErrors = data.errors
        ? Object.entries(data.errors)
            .map(([field, messages]) => `${field}: ${messages.join(", ")}`)
            .join("; ")
        : null;
      return { ok: false, error: fieldErrors ?? data.message ?? "Shiprocket rejected the order" };
    }

    if (!data.shipment_id) {
      return { ok: false, error: data.message ?? "Shiprocket did not return a shipment id" };
    }

    // An order can be created without a courier being assigned, in which case
    // there is no AWB yet. That is a real state, not an error — but it is also
    // not a booked shipment, so it must not be reported as one.
    if (!data.awb_code) {
      return {
        ok: false,
        error:
          "Order created in Shiprocket but no courier was assigned, so there is no tracking number yet. Assign one in their dashboard, then enter the AWB here.",
      };
    }

    const courierId = courierIdFromName(data.courier_name);

    // Validate what came back with the same rules as hand entry. A provider
    // returning something malformed is exactly the case where trusting the
    // API over the local check would put a dead tracking link in front of a
    // customer.
    const awb = checkAwb(courierId, data.awb_code);
    if (!awb.valid) {
      return {
        ok: false,
        error: `Shiprocket returned a tracking number that does not match ${data.courier_name ?? "the courier"}'s format: ${data.awb_code}`,
      };
    }

    return {
      ok: true,
      shipment: {
        courierId,
        awb: awb.normalised,
        providerShipmentId: String(data.shipment_id),
      },
    };
  },
};

/** Test seam: drop the cached login so a test can prove re-authentication. */
export function resetShiprocketTokenForTests(): void {
  cachedToken = null;
}
