// GST (Goods and Services Tax) calculation for Indian retail sales.
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️  THE RATES AND HSN CODES BELOW MUST BE CONFIRMED WITH A CHARTERED
//     ACCOUNTANT BEFORE INVOICING A REAL CUSTOMER.
//
//     Slabs were rationalised by the GST Council in September 2025, and
//     apparel is threshold-based, so the correct rate depends on both the
//     current notification and the per-piece price. Everything rate-related
//     is isolated in APPAREL_GST below so it can be corrected in one place.
// ─────────────────────────────────────────────────────────────────────────
//
// Two things this module gets right that are easy to get wrong:
//
//   1. Indian retail prices are quoted GST-INCLUSIVE. The customer pays the
//      listed price; tax is backed *out* of it for the invoice, not added on
//      top. So computing tax never changes what anyone pays.
//   2. Intra-state supply splits into CGST + SGST (half each); inter-state
//      is a single IGST at the full rate. Which one applies is decided by
//      the place of supply — the delivery state — against the seller's
//      registered state.

import { BUSINESS_INFO } from "@/lib/business-info";

/** Rate slabs for readymade garments, keyed on price per piece. */
export const APPAREL_GST = {
  /** Per-piece taxable value at or below this (in paise) takes the lower rate. */
  thresholdMinorUnits: 250000, // ₹2,500
  lowerRatePercent: 5,
  higherRatePercent: 18,
};

/**
 * The seller's state, taken from the first two digits of the GSTIN — that
 * prefix *is* the GST state code, so this can never drift from the GSTIN
 * printed on the invoice.
 */
export const SELLER_STATE_CODE = BUSINESS_INFO.gstin.slice(0, 2); // "36" = Telangana

// GST state codes, used to decide intra- vs inter-state supply.
const STATE_CODES: Record<string, string> = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  puducherry: "34",
  "andaman and nicobar islands": "35",
  telangana: "36",
  "andhra pradesh": "37",
  ladakh: "38",
};

/**
 * Resolves a GST state code from a state name or a full address string.
 *
 * Addresses are free text here, so this scans for a known state name rather
 * than assuming a field position. Longest match wins, so "Andhra Pradesh"
 * is not shadowed by a shorter name appearing elsewhere in the string.
 */
export function resolveStateCode(stateOrAddress: string): string | null {
  const haystack = stateOrAddress.toLowerCase().replace(/&/g, "and");
  const hit = Object.keys(STATE_CODES)
    .filter((name) => haystack.includes(name))
    .sort((a, b) => b.length - a.length)[0];
  return hit ? STATE_CODES[hit] : null;
}

export function gstRatePercent(pricePerPieceMinorUnits: number) {
  return pricePerPieceMinorUnits <= APPAREL_GST.thresholdMinorUnits
    ? APPAREL_GST.lowerRatePercent
    : APPAREL_GST.higherRatePercent;
}

/**
 * HSN codes by subcategory.
 *
 * ⚠️ PLACEHOLDER MAPPING — a wrong HSN on a tax invoice is worse than a
 * missing one. Confirm each of these against the product's actual
 * composition and construction before issuing real invoices.
 */
const HSN_BY_SUBCATEGORY: Record<string, string> = {
  "T-Shirts": "6109",
  Tops: "6106",
  Shirts: "6205",
  Kurtas: "6211",
  Sarees: "6211",
  Dresses: "6204",
  Jeans: "6203",
  Trousers: "6203",
  Shorts: "6203",
  Sweatshirts: "6110",
  Jackets: "6201",
  Sweaters: "6110",
};

/** Falls back to 6211 ("other garments"), the catch-all apparel heading. */
export function hsnFor(subcategory?: string) {
  return (subcategory && HSN_BY_SUBCATEGORY[subcategory]) || "6211";
}

export interface TaxableLine {
  name: string;
  qty: number;
  /** GST-inclusive price per unit, in paise. */
  price: number;
  subcategory?: string;
}

export interface LineTax {
  name: string;
  qty: number;
  hsn: string;
  ratePercent: number;
  /** GST-inclusive line total. */
  gross: number;
  /** Line total excluding tax. */
  taxableValue: number;
  taxAmount: number;
}

/**
 * Backs tax out of a GST-inclusive amount.
 *
 * taxableValue is rounded and taxAmount is taken as the remainder, so the
 * two always sum back to exactly `gross` — no rounding drift that would make
 * an invoice fail to foot.
 */
export function splitTaxInclusive(gross: number, ratePercent: number) {
  const taxableValue = Math.round((gross * 100) / (100 + ratePercent));
  return { taxableValue, taxAmount: gross - taxableValue };
}

export interface GstSummary {
  lines: LineTax[];
  taxableValue: number;
  totalTax: number;
  /** GST-inclusive grand total — equals the sum of line grosses. */
  grandTotal: number;
  isInterState: boolean;
  placeOfSupplyCode: string | null;
  /** Zero on an inter-state supply. */
  cgst: number;
  sgst: number;
  /** Zero on an intra-state supply. */
  igst: number;
  /** Tax grouped by rate — a GST invoice must show each slab separately. */
  byRate: Array<{ ratePercent: number; taxableValue: number; taxAmount: number }>;
}

export function computeGst(
  items: TaxableLine[],
  deliveryStateOrAddress: string
): GstSummary {
  const placeOfSupplyCode = resolveStateCode(deliveryStateOrAddress);
  // An unrecognised address is treated as intra-state: that splits the same
  // total into CGST+SGST rather than inventing an inter-state supply, and
  // the amount the customer pays is identical either way.
  const isInterState =
    placeOfSupplyCode !== null && placeOfSupplyCode !== SELLER_STATE_CODE;

  const lines = items.map<LineTax>((item) => {
    const ratePercent = gstRatePercent(item.price);
    const gross = item.qty * item.price;
    const { taxableValue, taxAmount } = splitTaxInclusive(gross, ratePercent);
    return {
      name: item.name,
      qty: item.qty,
      hsn: hsnFor(item.subcategory),
      ratePercent,
      gross,
      taxableValue,
      taxAmount,
    };
  });

  const taxableValue = lines.reduce((sum, l) => sum + l.taxableValue, 0);
  const totalTax = lines.reduce((sum, l) => sum + l.taxAmount, 0);
  const grandTotal = lines.reduce((sum, l) => sum + l.gross, 0);

  const rateMap = new Map<number, { taxableValue: number; taxAmount: number }>();
  for (const line of lines) {
    const entry = rateMap.get(line.ratePercent) ?? { taxableValue: 0, taxAmount: 0 };
    entry.taxableValue += line.taxableValue;
    entry.taxAmount += line.taxAmount;
    rateMap.set(line.ratePercent, entry);
  }
  const byRate = [...rateMap.entries()]
    .map(([ratePercent, v]) => ({ ratePercent, ...v }))
    .sort((a, b) => a.ratePercent - b.ratePercent);

  // Halve to the paise: CGST takes the floor and SGST the remainder, so the
  // pair always sums to totalTax even when it is an odd number of paise.
  const cgst = isInterState ? 0 : Math.floor(totalTax / 2);
  const sgst = isInterState ? 0 : totalTax - cgst;
  const igst = isInterState ? totalTax : 0;

  return {
    lines,
    taxableValue,
    totalTax,
    grandTotal,
    isInterState,
    placeOfSupplyCode,
    cgst,
    sgst,
    igst,
    byRate,
  };
}
