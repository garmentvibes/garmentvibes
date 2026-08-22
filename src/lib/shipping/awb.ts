// ---------------------------------------------------------------------------
// AWB (tracking number) validation.
//
// The admin panel accepts any non-empty string as an AWB, and the consequence
// is not abstract: the number goes straight into the shipment notification as
// a tracking link, so a typo sends the customer to a courier page that says
// "not found". They then contact support, who cannot tell whether the parcel
// is lost or the number is wrong.
//
// Each Indian courier issues AWBs in a recognisable shape. Checking that shape
// at the point of entry catches transposed digits and pasted whitespace before
// the message goes out. It cannot catch a well-formed number belonging to a
// different parcel — nothing short of the courier's own API can — so this is a
// typo guard, and the messages say so rather than claiming the number is real.
// ---------------------------------------------------------------------------

export interface AwbFormat {
  /** Matches a valid AWB for this courier, after normalisation. */
  pattern: RegExp;
  /** Shown when the pattern fails. Describes the shape, not the rule. */
  hint: string;
}

// Formats as published by each carrier. Where a courier issues more than one
// series, the pattern is the union rather than the narrowest case — refusing a
// valid number is worse than accepting a malformed one, because it blocks a
// real dispatch.
export const AWB_FORMATS: Record<string, AwbFormat> = {
  delhivery: {
    pattern: /^\d{11,14}$/,
    hint: "Delhivery AWBs are 11–14 digits",
  },
  bluedart: {
    pattern: /^\d{11}$/,
    hint: "Blue Dart waybills are 11 digits",
  },
  dtdc: {
    // DTDC issues both all-digit and letter-prefixed series.
    pattern: /^[A-Z0-9]{9,15}$/,
    hint: "DTDC consignment numbers are 9–15 letters or digits",
  },
  ekart: {
    // Ekart prefixes vary by service (FMPC, FMPP, SRTP…), so the letter run is
    // 2–4 rather than pinned — a narrower pattern rejected a real FMPC number
    // when this was first written.
    pattern: /^[A-Z]{2,4}\d{9,12}$/,
    hint: "Ekart tracking IDs are 2–4 letters followed by 9–12 digits",
  },
  indiapost: {
    // Universal Postal Union S10: 2 letters, 9 digits, 2-letter country code.
    pattern: /^[A-Z]{2}\d{9}IN$/,
    hint: "India Post uses the S10 format, e.g. EE123456789IN",
  },
};

/**
 * Trims and upper-cases, and strips the spaces and hyphens couriers print into
 * their own labels for legibility. Someone copying from a printed label should
 * not be told their number is wrong because it arrived as "EE 1234 5678 9IN".
 */
export function normaliseAwb(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

export interface AwbCheck {
  valid: boolean;
  /** The normalised value to store. Present even when invalid. */
  normalised: string;
  /** Why it was rejected. Absent when valid. */
  error?: string;
}

/**
 * Checks an AWB against the issuing courier's format.
 *
 * An unknown courier id passes anything non-empty: a courier we have no format
 * for is a gap in this table, and blocking dispatch over it would make adding
 * a carrier a breaking change.
 */
export function checkAwb(courierId: string | undefined, input: string): AwbCheck {
  const normalised = normaliseAwb(input);

  if (!normalised) {
    return { valid: false, normalised, error: "Enter the AWB / tracking number" };
  }

  const format = courierId ? AWB_FORMATS[courierId] : undefined;
  if (!format) return { valid: true, normalised };

  if (!format.pattern.test(normalised)) {
    return {
      valid: false,
      normalised,
      error: `That does not look like a valid tracking number — ${format.hint}. Check it before the customer is emailed a link.`,
    };
  }

  return { valid: true, normalised };
}
