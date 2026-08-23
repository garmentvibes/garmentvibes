export interface PromoCode {
  /** Always stored uppercase; codes are matched case-insensitively. */
  code: string;
  percent: number;
  active: boolean;
  /** ISO date. Absent means the code never expires. */
  expiresOn?: string;
  /**
   * Total redemptions allowed across all customers. Absent means unlimited,
   * which is only safe for a code that is never shared publicly.
   *
   * A percentage code with no cap can be posted anywhere and used without
   * limit — supabase/README.md listed this as a known gap for exactly that
   * reason.
   */
  maxRedemptions?: number;
  /**
   * Redemptions allowed per customer. Absent means unlimited.
   *
   * The other half of the same problem: a cap of 500 total does nothing if
   * one person can use all 500.
   */
  maxPerCustomer?: number;
  /**
   * Defined in lib/pricing.ts and compiled into the server's validation
   * list. Can be deactivated but not deleted, so the admin UI and the
   * payment route can never disagree about which codes exist.
   */
  builtIn?: boolean;
  /**
   * Issued as a referral reward and tied to one person. Only that customer
   * may redeem it, regardless of who else learns the code.
   */
  issuedTo?: string;
}

/**
 * Who has redeemed what.
 *
 * Keyed by code, then by customer email. Counting per customer is what makes
 * `maxPerCustomer` enforceable, and keeping the totals derivable from the same
 * record means the two caps cannot disagree about how many redemptions have
 * happened.
 */
export type PromoRedemptions = Record<string, Record<string, number>>;
