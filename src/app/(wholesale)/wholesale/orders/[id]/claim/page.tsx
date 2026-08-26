"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { useMyQuote } from "@/lib/hooks/use-my-quotes";
import { useClaimsStore, useClaimsForOrder } from "@/lib/stores/claims-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { notify } from "@/lib/stores/notification-store";
import { claimEligibility, CLAIM_INELIGIBLE_MESSAGES, CLAIM_WINDOW_DAYS } from "@/lib/claims";
import {
  CLAIM_REASONS,
  CLAIM_RESOLUTION_LABELS,
  type ClaimReason,
  type ClaimResolution,
} from "@/types/claims";

export default function WholesaleClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const mounted = useHasMounted();
  const now = useNow();
  const { quote: order } = useMyQuote(id);
  const existingClaims = useClaimsForOrder(id);
  const createClaim = useClaimsStore((s) => s.create);

  const [claimed, setClaimed] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<ClaimReason>(CLAIM_REASONS[0]);
  const [resolution, setResolution] = useState<ClaimResolution>("credit_note");
  const [comments, setComments] = useState("");

  if (!mounted || now === null) return null;

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="text-slate-500">Order not found.</p>
        <Link href="/wholesale/dashboard" className="mt-4 inline-block text-sm text-blue-700 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const eligibility = claimEligibility(order, existingClaims, now);

  if (!eligibility.eligible) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Link
          href="/wholesale/dashboard"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-8 text-center">
          <h1 className="text-lg font-bold text-slate-900">Claim not available</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            {CLAIM_INELIGIBLE_MESSAGES[eligibility.reason!]}
          </p>
        </div>
      </div>
    );
  }

  const chosen = order.items
    .map((item, i) => ({ item, qty: claimed[i] ?? 0, index: i }))
    .filter((x) => x.qty > 0);
  const claimValue = chosen.reduce((sum, x) => sum + x.qty * x.item.pricePerUnit, 0);

  function submit() {
    if (chosen.length === 0) {
      toast.error("Enter the affected quantity on at least one line");
      return;
    }

    const claim = createClaim({
      orderId: order!.id,
      businessName: order!.businessName,
      contactName: order!.contactName,
      email: order!.email,
      reason,
      requestedResolution: resolution,
      lines: chosen.map((x) => ({
        sku: x.item.sku,
        name: x.item.name,
        billedQty: x.item.qty,
        claimedQty: x.qty,
        pricePerUnit: x.item.pricePerUnit,
      })),
      comments: comments.trim() || undefined,
    });

    notify({
      templateId: "claim_received",
      recipientName: order!.contactName,
      email: order!.email,
      relatedTo: claim.id,
      vars: {
        name: order!.contactName,
        orderId: order!.id,
        reason,
        amount: formatPrice(claimValue),
        businessName: order!.businessName,
      },
    });

    toast.success("Claim submitted — we'll review it within 3 business days");
    router.push("/wholesale/dashboard");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href="/wholesale/dashboard"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to dashboard
      </Link>

      <h1 className="mt-3 text-xl font-bold text-slate-900">Raise a claim</h1>
      <p className="mt-1 text-sm text-slate-500">
        Order <span className="font-mono">{order.id}</span> &middot; {eligibility.daysLeft}{" "}
        {eligibility.daysLeft === 1 ? "day" : "days"} left in the {CLAIM_WINDOW_DAYS}-day window
        {eligibility.closesOn ? ` (closes ${eligibility.closesOn})` : ""}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900">Affected quantities</h2>
        <p className="mt-1 text-xs text-slate-500">
          Enter how many units are missing, damaged or wrong on each line — not the full billed
          quantity.
        </p>
        <ul className="mt-2 space-y-2">
          {order.items.map((item, i) => (
            <li
              key={`${item.sku}-${i}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-slate-800">{item.name}</p>
                <p className="font-mono text-xs text-slate-400">{item.sku}</p>
                <p className="text-xs text-slate-500">
                  {item.qty} units billed &middot; {formatPrice(item.pricePerUnit)}/unit
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`claim-${i}`} className="text-xs text-slate-500">
                  Affected
                </Label>
                <input
                  id={`claim-${i}`}
                  type="number"
                  min={0}
                  max={item.qty}
                  value={claimed[i] ?? 0}
                  onChange={(e) => {
                    // Can't claim more than was invoiced.
                    const next = Math.min(Number(e.target.value) || 0, item.qty);
                    setClaimed((prev) => ({ ...prev, [i]: Math.max(0, next) }));
                  }}
                  className="h-9 w-24 rounded-md border border-slate-300 px-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="claim-reason">What happened?</Label>
          <select
            id="claim-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as ClaimReason)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {CLAIM_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="claim-resolution">Preferred resolution</Label>
          <select
            id="claim-resolution"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as ClaimResolution)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {(Object.keys(CLAIM_RESOLUTION_LABELS) as ClaimResolution[]).map((r) => (
              <option key={r} value={r}>
                {CLAIM_RESOLUTION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="mt-4">
        <Label htmlFor="claim-comments">Details (optional)</Label>
        <textarea
          id="claim-comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Carton numbers, condition on arrival, anything the carrier noted."
        />
      </section>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">Claim value</span>
          <span className="font-semibold text-slate-900">{formatPrice(claimValue)}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
          <PackageX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Keep the affected cartons and packaging until we&apos;ve been in touch — we may need
          photographs or a carrier inspection to recover against the consignment.
        </p>
      </div>

      <Button className="mt-4 w-full" onClick={submit}>
        Submit claim
      </Button>
    </div>
  );
}
