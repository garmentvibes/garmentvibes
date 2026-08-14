export interface PromoCode {
  /** Always stored uppercase; codes are matched case-insensitively. */
  code: string;
  percent: number;
  active: boolean;
  /** ISO date. Absent means the code never expires. */
  expiresOn?: string;
  /**
   * Defined in lib/pricing.ts and compiled into the server's validation
   * list. Can be deactivated but not deleted, so the admin UI and the
   * payment route can never disagree about which codes exist.
   */
  builtIn?: boolean;
}
