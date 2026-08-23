import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared validators for the fields a parcel is delivered against.
//
// These lived twice — once in the checkout schema, once in the address book —
// and both were loose enough to accept input the rest of the system cannot
// use. `min(4)` on a PIN code passed "50000", which is not a PIN code: every
// other part of the app assumes six digits, `estimateDelivery()` matches
// /^\d{6}$/ and returns null for anything else, and a null estimate is read as
// "still typing, offer COD anyway". So a five-digit code slipped past the
// remote-area COD rule and then went onto the shipping label and the GST
// invoice.
//
// One definition, used by both forms, so the next form to be added cannot
// disagree with them.
// ---------------------------------------------------------------------------

/** Indian PIN codes are exactly six digits. Not four, not five, not seven. */
export const PINCODE_PATTERN = /^\d{6}$/;

export const pincodeField = z
  .string()
  .trim()
  .regex(PINCODE_PATTERN, "Enter a valid 6-digit PIN code");

/**
 * An Indian mobile number: ten digits beginning 6–9, with an optional +91,
 * 91 or 0 in front.
 *
 * `min(10)` accepted a fifteen-character string of anything at all. The number
 * is what the courier calls when they cannot find the address and what the
 * delivery SMS goes to, so a wrong one costs a delivery rather than a form
 * field.
 *
 * Deliberately mobile-only. Landlines cannot receive the delivery SMS or an
 * OTP, and every Indian courier's contact field expects a mobile.
 */
export const PHONE_PATTERN = /^(?:\+?91|0)?[6-9]\d{9}$/;

export const phoneField = z
  .string()
  .trim()
  // Spaces and hyphens are how people actually type a number; strip them
  // before matching rather than rejecting "98765 43210".
  .transform((value) => value.replace(/[\s-]/g, ""))
  .refine((value) => PHONE_PATTERN.test(value), "Enter a valid 10-digit mobile number");

/**
 * The last ten digits — what gets stored and sent to a courier.
 *
 * Normalising means two customers who typed "+919876543210" and "9876543210"
 * are not two different contact numbers on two orders.
 */
export function normalisePhone(value: string): string {
  return value.replace(/[\s-]/g, "").slice(-10);
}
