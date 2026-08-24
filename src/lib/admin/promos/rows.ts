import type { ManagedPromoCode } from "./form";

// ---------------------------------------------------------------------------
// Stored promo rows, as the admin list renders them.
//
// The two sides use different names for the same things — `max_redemptions`
// against `maxRedemptions`, `expires_on` against `expiresOn` — and null
// against undefined. Doing that conversion inline in the action is how a
// nullable column quietly becomes the string "null" in a form field.
// ---------------------------------------------------------------------------

export interface PromoCodeRow {
  code: string;
  percent: number;
  active: boolean;
  built_in: boolean;
  starts_on: string | null;
  expires_on: string | null;
  max_redemptions: number | null;
  max_per_customer: number | null;
  issued_to: string | null;
}

export interface PromoUsageRow {
  code: string;
  redemptions: number;
  customers: number;
}

/**
 * Joins codes to their usage counts for the admin list.
 *
 * A code with no usage row is not possible — `promo_code_usage` left-joins, so
 * every code has one — but it is defended against anyway: the two reads are
 * separate round trips, and a code created between them would otherwise render
 * `undefined of 100 used`. Zero is both the honest answer and a number.
 */
export function toManagedCodes(
  rows: PromoCodeRow[],
  usage: PromoUsageRow[]
): ManagedPromoCode[] {
  const byCode = new Map(usage.map((u) => [u.code, u]));

  return rows.map((row) => {
    const used = byCode.get(row.code);

    return {
      code: row.code,
      percent: row.percent,
      active: row.active,
      builtIn: row.built_in,
      // `expires_on` is a date, so it arrives as YYYY-MM-DD and the UI wants
      // exactly that. Passing it through a Date would move it across a
      // timezone boundary and show the wrong day to half the world.
      expiresOn: row.expires_on ?? undefined,
      maxRedemptions: row.max_redemptions ?? undefined,
      maxPerCustomer: row.max_per_customer ?? undefined,
      issuedTo: row.issued_to ?? undefined,
      redemptions: used?.redemptions ?? 0,
      customers: used?.customers ?? 0,
    };
  });
}

/**
 * Newest-looking first: live codes before switched-off ones, then
 * alphabetically.
 *
 * `promo_codes` has a `created_at`, and it is deliberately not used for this.
 * The built-in codes all share the timestamp of whenever the seed ran, so
 * ordering by it puts them in an arbitrary block; what an admin is looking for
 * in this list is which codes are working, and that is `active`.
 */
export function sortForAdmin(codes: ManagedPromoCode[]): ManagedPromoCode[] {
  return [...codes].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.code.localeCompare(b.code);
  });
}
