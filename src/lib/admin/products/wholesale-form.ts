import type { WholesaleCategory, WholesalePriceTier } from "@/types/catalog";

// ---------------------------------------------------------------------------
// Validating a wholesale product from the admin form.
//
// Lifted out of WholesaleProductForm's onSubmit for the same reason as the
// retail one: the browser's copy is for immediate feedback, the server
// action's copy is the one an admin cannot skip.
//
// The tier rules are the part worth the file. A retail product has one price
// and one way to get it wrong; a wholesale product has a tier table that every
// quote, the pricing calculator and the price-list export read, and
// `wholesalePriceForQty` walks it assuming things this is what enforces.
// ---------------------------------------------------------------------------

export interface TierInput {
  minQty: string;
  /** Rupees as typed. */
  pricePerUnit: string;
}

export interface WholesaleProductFormInput {
  name: string;
  sku: string;
  category: WholesaleCategory;
  subcategory: string;
  description: string;
  moq: string;
  packSize: string;
  fabric: string;
  sizeRun: string;
  colors: string;
  leadTimeDays: string;
  tiers: TierInput[];
}

/** A validated product, in the units the database stores. */
export interface WholesaleProductDraft {
  name: string;
  sku: string;
  category: WholesaleCategory;
  subcategory: string;
  description: string;
  moq: number;
  packSize: number;
  /** Ascending by quantity, prices descending. */
  priceTiers: WholesalePriceTier[];
  fabric: string;
  sizeRun: string;
  colors: string[];
  leadTimeDays: number;
}

export type WholesaleProductFormResult =
  | { ok: true; value: WholesaleProductDraft }
  | { ok: false; error: string };

function fail(error: string): WholesaleProductFormResult {
  return { ok: false, error };
}

function toMinorUnits(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;

  // Rounded, not truncated — see the retail note: 1299.99 rupees arrives as
  // 129998.99999999999 paise.
  return Math.round(rupees * 100);
}

function toWholeNumber(raw: string): number | null {
  const value = Number(raw.trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Parses the wholesale form, or explains what is wrong with it. */
export function parseWholesaleProductForm(
  input: WholesaleProductFormInput
): WholesaleProductFormResult {
  const name = input.name.trim();
  const sku = input.sku.trim().toUpperCase();
  const subcategory = input.subcategory.trim();

  if (!name || !sku || !subcategory) {
    return fail("Name, SKU and subcategory are required");
  }

  const moq = toWholeNumber(input.moq);
  if (moq === null) return fail("MOQ must be a whole number of units");

  const packSize = toWholeNumber(input.packSize);
  if (packSize === null) return fail("Pack size must be a whole number of units");

  // Orders are placed in multiples of the pack size, so an MOQ that is not one
  // is an MOQ no buyer can actually order — they land either just under or
  // just over it, and the portal refuses both.
  if (moq % packSize !== 0) {
    return fail(`MOQ must be a multiple of the pack size (${packSize})`);
  }

  const tiers: WholesalePriceTier[] = [];
  for (const tier of input.tiers) {
    if (!tier.minQty.trim() && !tier.pricePerUnit.trim()) continue;

    const minQty = toWholeNumber(tier.minQty);
    if (minQty === null) return fail("Each tier needs a whole-number minimum quantity");

    const pricePerUnit = toMinorUnits(tier.pricePerUnit);
    if (pricePerUnit === null || pricePerUnit < 1) {
      return fail("Each tier needs a unit price");
    }

    tiers.push({ minQty, pricePerUnit });
  }

  if (tiers.length === 0) return fail("Add at least one price tier");

  tiers.sort((a, b) => a.minQty - b.minQty);

  // Two tiers at the same quantity make "the last tier whose minQty is met"
  // ambiguous, and which one wins would come down to sort stability.
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].minQty === tiers[i - 1].minQty) {
      return fail(`Two tiers both start at ${tiers[i].minQty} units`);
    }
  }

  // Prices must fall as quantity rises. `wholesalePriceForQty` picks the last
  // tier the quantity clears, so an increasing tier quotes a *higher* unit
  // price for a *bigger* order — which a buyer notices, and which makes the
  // volume discount the portal advertises a lie.
  for (let i = 1; i < tiers.length; i += 1) {
    if (tiers[i].pricePerUnit > tiers[i - 1].pricePerUnit) {
      return fail("Each higher-quantity tier must have a lower (or equal) unit price");
    }
  }

  // The first tier is what a buyer ordering the minimum pays, so a tier table
  // that starts above the MOQ leaves the MOQ unpriced.
  if (tiers[0].minQty > moq) {
    return fail(`The first tier must start at or below the MOQ (${moq})`);
  }

  return {
    ok: true,
    value: {
      name,
      sku,
      category: input.category,
      subcategory,
      description: input.description.trim(),
      moq,
      packSize,
      priceTiers: tiers,
      fabric: input.fabric.trim(),
      sizeRun: input.sizeRun.trim(),
      colors: input.colors
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      // Defaulted rather than rejected: a blank lead time means nobody has
      // measured it, and a week is what the portal has always shown.
      leadTimeDays: toWholeNumber(input.leadTimeDays) ?? 7,
    },
  };
}
