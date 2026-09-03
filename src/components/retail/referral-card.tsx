"use client";

import { useState } from "react";
import { Gift, Copy, Check } from "lucide-react";

import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useReferralStore, referralsMadeBy } from "@/lib/stores/referral-store";
import { usePromoStore } from "@/lib/stores/promo-store";
import { totalRedemptions } from "@/lib/promo-eligibility";
import {
  REFERRAL_FRIEND_PERCENT,
  REFERRAL_REWARD_PERCENT,
  referralCodeFor,
} from "@/lib/referrals";

/** The customer's own referral code, and what it has earned them so far. */
export function ReferralCard({ email }: { email: string }) {
  const mounted = useHasMounted();
  const referrals = useReferralStore((s) => s.referrals);
  const codes = usePromoStore((s) => s.codes);
  const redemptions = usePromoStore((s) => s.redemptions);
  const [copied, setCopied] = useState(false);

  if (!mounted) return null;

  const code = referralCodeFor(email);
  const made = referralsMadeBy(referrals, email);
  const rewards = codes.filter((c) => c.issuedTo?.toLowerCase() === email.toLowerCase());
  const unused = rewards.filter((c) => totalRedemptions(redemptions, c.code) === 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some contexts and over plain HTTP. The
      // code is on screen either way, so this is a convenience failing, not
      // the feature failing — saying nothing is better than an error toast
      // for something the customer can simply read.
    }
  }

  return (
    <section
      aria-labelledby="referral-heading"
      className="rounded-lg border border-neutral-200 bg-white p-5"
    >
      <h2 id="referral-heading" className="flex items-center gap-2 font-semibold text-neutral-900">
        <Gift className="h-4 w-4 text-rose-600" /> Refer a friend
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        They get {REFERRAL_FRIEND_PERCENT}% off their first order. Once they order, you get{" "}
        {REFERRAL_REWARD_PERCENT}% off yours.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <code
          data-testid="referral-code"
          className="rounded-md border border-dashed border-rose-300 bg-rose-50 px-3 py-1.5 font-mono text-sm font-semibold tracking-wider text-rose-700"
        >
          {code}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy referral code"
          className="flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-neutral-400"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <dl className="mt-4 flex gap-6 text-sm">
        <div>
          <dt className="text-xs text-neutral-500">Friends joined</dt>
          <dd className="font-semibold text-neutral-900">{made.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">Rewards unused</dt>
          <dd className="font-semibold text-neutral-900">{unused.length}</dd>
        </div>
      </dl>

      {unused.length > 0 && (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <p className="text-xs text-neutral-500">Ready to use at checkout:</p>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {unused.map((reward) => (
              <li
                key={reward.code}
                className="rounded-md bg-green-50 px-2 py-1 font-mono text-xs font-semibold text-green-800"
              >
                {reward.code} · {reward.percent}% off
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
