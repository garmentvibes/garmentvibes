import { computeGst, hsnFor, SELLER_STATE_CODE } from "@/lib/gst";
import { BUSINESS_INFO } from "@/lib/business-info";
import { codFee, type PaymentMethodId } from "@/lib/payment-methods";
import type { CartLine } from "@/lib/stores/cart-store";

// ---------------------------------------------------------------------------
// Turning a basket into the arguments place_retail_order() expects.
//
// Split out from the server action deliberately. The action itself is a
// network call wrapped in an auth check — there is nothing in it to get wrong
// that a test could catch. All the arithmetic that decides what a customer is
// charged lives here, in a pure function, where it can be tested without a
// database.
//
// Nothing here is trusted by the database. Every figure below is recomputed by
// the function on the other side and the call is rejected if the two disagree
// — see supabase/migrations/0013_order_placement.sql. That is on purpose: this
// module is the convenient path, not the authority, and a bug in it should
// fail the order rather than mispricing it.
// ---------------------------------------------------------------------------

export interface OrderLinePayload {
  /**
   * The catalogue slug, not the id.
   *
   * src/lib/mock/ numbers products "r1", "r10"; the database generates uuids
   * and the seed joins them by slug. The slug is the only identifier both
   * sides share.
   */
  slug: string;
  size: string;
  color: string;
  qty: number;
  /** GST-inclusive price per unit, in paise. */
  price: number;
  hsn_code: string;
  tax_rate: number;
  taxable_value: number;
  tax_amount: number;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderPayload {
  p_items: OrderLinePayload[];
  p_address: ShippingAddress;
  p_customer_name: string;
  p_customer_email: string;
  p_phone: string;
  p_payment_method: PaymentMethodId;
  p_promo_code: string | null;
  p_subtotal: number;
  p_discount: number;
  p_cod_fee: number;
  p_tax_cgst: number;
  p_tax_sgst: number;
  p_tax_igst: number;
  p_total: number;
  p_place_of_supply: string | null;
  p_seller_gstin: string;
  p_reference: string;
}

export class OrderPayloadError extends Error {}

export interface BuildOrderInput {
  lines: CartLine[];
  address: ShippingAddress;
  customerEmail: string;
  paymentMethod: PaymentMethodId;
  /** The code the customer typed, and the percent it is worth. */
  promo?: { code: string; percent: number } | null;
  reference: string;
}

/**
 * Builds the RPC arguments for one order.
 *
 * Throws rather than returning a partial payload: an order that cannot be
 * priced must not reach the payment step at all, and a silently dropped line
 * is a parcel short.
 */
export function buildOrderPayload(input: BuildOrderInput): OrderPayload {
  const { lines, address, customerEmail, paymentMethod, promo, reference } = input;

  if (lines.length === 0) {
    throw new OrderPayloadError("An order needs at least one item");
  }

  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      throw new OrderPayloadError(`Invalid quantity for ${line.name}`);
    }
    if (!Number.isInteger(line.price) || line.price < 1) {
      throw new OrderPayloadError(`Invalid price for ${line.name}`);
    }
  }

  // Tax is computed on the delivery address, not the billing one: GST follows
  // the place of supply.
  const gst = computeGst(
    lines.map((line) => ({
      name: line.name,
      qty: line.qty,
      price: line.price,
      subcategory: line.subcategory,
    })),
    address.state
  );

  const items: OrderLinePayload[] = lines.map((line, index) => {
    const tax = gst.lines[index];
    return {
      slug: line.slug,
      size: line.size,
      color: line.color,
      qty: line.qty,
      price: line.price,
      hsn_code: tax.hsn,
      tax_rate: tax.ratePercent,
      taxable_value: tax.taxableValue,
      tax_amount: tax.taxAmount,
    };
  });

  const subtotal = gst.grandTotal;

  // Rounded the same way the database rounds it. A different rounding here
  // would not overcharge anyone — the call would simply be refused — but it
  // would refuse it at the moment the customer pressed Pay, which is the worst
  // possible time to discover a half-paise disagreement.
  const discount = promo ? Math.round((subtotal * promo.percent) / 100) : 0;

  if (discount > subtotal) {
    throw new OrderPayloadError("A discount cannot exceed the order value");
  }

  // The COD fee applies to what is actually owed, so it is charged on the
  // discounted amount — a promo code that takes an order under the free-COD
  // threshold should mean the fee applies, not that it is waived on a total
  // the customer is not paying.
  const fee = paymentMethod === "cod" ? codFee(subtotal - discount) : 0;

  return {
    p_items: items,
    p_address: address,
    p_customer_name: address.fullName,
    p_customer_email: customerEmail,
    p_phone: address.phone,
    p_payment_method: paymentMethod,
    p_promo_code: promo?.code ?? null,
    p_subtotal: subtotal,
    p_discount: discount,
    p_cod_fee: fee,
    p_tax_cgst: gst.cgst,
    p_tax_sgst: gst.sgst,
    p_tax_igst: gst.igst,
    p_total: subtotal - discount + fee,
    // Null when the address names a state we do not recognise. Storing a
    // guess would put a wrong state code on a GST invoice, which is worse
    // than an absent one.
    p_place_of_supply: gst.placeOfSupplyCode,
    p_seller_gstin: BUSINESS_INFO.gstin,
    p_reference: reference,
  };
}

/** The amount to charge, in paise. What Razorpay's order is created for. */
export function payableAmount(payload: OrderPayload): number {
  return payload.p_total;
}

/** True when the supply crosses a state border, so IGST applies. */
export function isInterState(payload: OrderPayload): boolean {
  return payload.p_place_of_supply !== null
    && payload.p_place_of_supply !== SELLER_STATE_CODE;
}

/** Re-exported so the HSN lookup has one home. */
export { hsnFor };
