// The shape every shipping provider presents to the rest of the app.
//
// Two implementations are expected: the manual one (a human reads the AWB off
// the courier's own dashboard and types it in — what happens today) and an
// aggregator. Naming the interface first is what stops the aggregator's
// request shapes leaking into the admin panel, which is how a courier
// integration becomes impossible to replace.

export interface ShipmentRequest {
  /** Our order reference, echoed back by the courier for reconciliation. */
  orderId: string;
  customerName: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  /** Order value in minor units. Drives insurance and COD collection. */
  value: number;
  /** Amount to collect on delivery, minor units. Zero for a prepaid order. */
  collectOnDelivery: number;
  items: Array<{ name: string; sku: string; qty: number; price: number }>;
  /** Total shipment weight in kilograms. */
  weightKg: number;
}

export interface BookedShipment {
  courierId: string;
  awb: string;
  /** Provider's own shipment id, for later label and pickup calls. */
  providerShipmentId: string;
  /** URL to a printable label, when the provider generated one. */
  labelUrl?: string;
  /** Courier's own estimate, when it gives one. */
  expectedDelivery?: string;
}

export type BookingResult =
  | { ok: true; shipment: BookedShipment }
  | { ok: false; error: string };

export interface ShippingProvider {
  readonly id: string;
  /** False when credentials are missing; the caller falls back to manual. */
  readonly configured: boolean;
  book(request: ShipmentRequest): Promise<BookingResult>;
}
