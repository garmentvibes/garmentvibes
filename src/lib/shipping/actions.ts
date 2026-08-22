"use server";

import { requireStaff } from "@/lib/auth/dal";
import { isShiprocketConfigured } from "./config";
import { shiprocketProvider } from "./shiprocket";
import type { BookingResult, ShipmentRequest } from "./types";

/**
 * Books a shipment with the configured aggregator.
 *
 * `requireStaff()` first, and that is not decoration: Next's proxy
 * documentation is explicit that a matcher does not reliably cover Server
 * Functions, so this cannot lean on `/admin` being gated. Booking a shipment
 * spends money and hands a customer's address to a third party; it gets its
 * own check.
 *
 * The request is assembled by the caller rather than looked up here because
 * orders still live in the browser's localStorage — see the store→table map
 * in supabase/README.md. Once orders are in `retail_orders`, this should take
 * an order id and read the details server-side, so the address that goes to
 * the courier is the one on the order rather than the one the page happened
 * to be holding.
 */
export async function bookShipment(request: ShipmentRequest): Promise<BookingResult> {
  await requireStaff();

  if (!isShiprocketConfigured()) {
    return {
      ok: false,
      error:
        "No shipping account is configured on this deployment. Book with the courier directly and enter the AWB below.",
    };
  }

  return shiprocketProvider.book(request);
}

/** Whether the admin panel should offer one-click booking at all. */
export async function shippingBookingAvailable(): Promise<boolean> {
  await requireStaff();
  return isShiprocketConfigured();
}
