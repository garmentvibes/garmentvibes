import { create } from "zustand";
import { persist } from "zustand/middleware";

// Who referred whom.
//
// Becomes a `referrals` table once Supabase is connected, with a unique
// constraint on `friend_email` — that constraint, not this store, is what
// actually enforces one referral per customer. Browser-side state can only
// state the rule; it cannot hold it against someone with two browsers.
//
// `knownEmails` exists because a referral code is a hash of an email and
// cannot be reversed. Resolving a code back to a person means checking it
// against the customers we know about. In the database this is a lookup on
// `profiles`; here it is a list this store accumulates as accounts sign in.

export interface Referral {
  /** The person whose code was used. */
  referrerEmail: string;
  /** The new customer who used it. */
  friendEmail: string;
  code: string;
  createdAt: string; // ISO
  /** The reward code issued to the referrer, once the friend ordered. */
  rewardCode?: string;
}

interface ReferralState {
  referrals: Referral[];
  /** Emails of customers we have seen, for resolving codes back to people. */
  knownEmails: string[];
  rememberCustomer: (email: string) => void;
  record: (referral: Omit<Referral, "createdAt">) => void;
  markRewarded: (friendEmail: string, rewardCode: string) => void;
}

export const useReferralStore = create<ReferralState>()(
  persist(
    (set, get) => ({
      referrals: [],
      knownEmails: [],

      rememberCustomer: (email) => {
        const normalised = email.trim().toLowerCase();
        if (!normalised || get().knownEmails.includes(normalised)) return;
        set({ knownEmails: [...get().knownEmails, normalised] });
      },

      record: (referral) =>
        set((s) => ({
          referrals: [
            ...s.referrals.filter(
              (r) => r.friendEmail.toLowerCase() !== referral.friendEmail.toLowerCase()
            ),
            { ...referral, createdAt: new Date().toISOString() },
          ],
        })),

      markRewarded: (friendEmail, rewardCode) =>
        set((s) => ({
          referrals: s.referrals.map((r) =>
            r.friendEmail.toLowerCase() === friendEmail.toLowerCase()
              ? { ...r, rewardCode }
              : r
          ),
        })),
    }),
    { name: "garmentvibes-referrals", skipHydration: true }
  )
);

/** Referral codes this customer has already used. */
export function referralsUsedBy(referrals: Referral[], email: string): string[] {
  const normalised = email.trim().toLowerCase();
  return referrals
    .filter((r) => r.friendEmail.toLowerCase() === normalised)
    .map((r) => r.code);
}

/** People this customer has brought in. */
export function referralsMadeBy(referrals: Referral[], email: string): Referral[] {
  const normalised = email.trim().toLowerCase();
  return referrals.filter((r) => r.referrerEmail.toLowerCase() === normalised);
}
