"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, X, Search, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatPrice } from "@/lib/utils";
import { useClaimsStore } from "@/lib/stores/claims-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { notify } from "@/lib/stores/notification-store";
import {
  CLAIM_RESOLUTION_LABELS,
  CLAIM_STATUS_LABELS,
  claimValue,
  claimedUnits,
  type ClaimStatus,
  type WholesaleClaim,
} from "@/types/claims";

type Filter = ClaimStatus | "all";

const STATUS_VARIANT: Record<ClaimStatus, "warning" | "success" | "destructive"> = {
  submitted: "warning",
  under_review: "warning",
  approved: "warning",
  rejected: "destructive",
  settled: "success",
};

const FILTERS: Filter[] = ["submitted", "under_review", "approved", "settled", "rejected", "all"];

export default function AdminClaimsPage() {
  const mounted = useHasMounted();
  const claims = useClaimsStore((s) => s.claims);
  const setStatus = useClaimsStore((s) => s.setStatus);
  const [filter, setFilter] = useState<Filter>("submitted");

  if (!mounted) return null;

  const visible = claims.filter((c) => filter === "all" || c.status === filter);
  const openCount = claims.filter((c) => c.status === "submitted").length;

  function review(claim: WholesaleClaim) {
    setStatus(claim.id, "under_review", "Under review — carrier inspection may be requested.");
    toast.success(`Claim ${claim.id} moved to review`);
  }

  function approve(claim: WholesaleClaim) {
    setStatus(
      claim.id,
      "approved",
      `Approved as a ${CLAIM_RESOLUTION_LABELS[claim.requestedResolution].toLowerCase()}.`
    );
    toast.success(`Claim ${claim.id} approved`);
  }

  function reject(claim: WholesaleClaim) {
    setStatus(claim.id, "rejected", "Rejected after review.");
    notify({
      templateId: "claim_resolved",
      recipientName: claim.contactName,
      email: claim.email,
      relatedTo: claim.id,
      vars: { name: claim.contactName, orderId: claim.orderId, reason: "rejection" },
    });
    toast.success(`Claim ${claim.id} rejected — buyer notified`);
  }

  function settle(claim: WholesaleClaim) {
    setStatus(claim.id, "settled");
    notify({
      templateId: "claim_resolved",
      recipientName: claim.contactName,
      email: claim.email,
      relatedTo: claim.id,
      vars: {
        name: claim.contactName,
        orderId: claim.orderId,
        reason: CLAIM_RESOLUTION_LABELS[claim.requestedResolution].toLowerCase(),
        amount: formatPrice(claimValue(claim)),
      },
    });
    toast.success(`Claim ${claim.id} settled — buyer notified`);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-neutral-900">Wholesale claims</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {openCount} awaiting review. Short shipments and transit damage reported by bulk buyers,
        raised per line against the invoiced quantity.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              filter === f
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
            )}
          >
            {f === "all" ? "All" : CLAIM_STATUS_LABELS[f]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">
          {claims.length === 0
            ? "No claims have been raised. That's the good outcome."
            : "No claims match this filter."}
        </p>
      ) : (
        <ul id="claims-list" className="mt-5 space-y-3">
          {visible.map((claim) => (
            <li key={claim.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-neutral-900">
                      {claim.id}
                    </span>
                    <Badge variant={STATUS_VARIANT[claim.status]}>
                      {CLAIM_STATUS_LABELS[claim.status]}
                    </Badge>
                    <Link
                      href={`/admin/quotes/${claim.orderId}`}
                      className="font-mono text-xs text-neutral-500 underline hover:text-neutral-800"
                    >
                      {claim.orderId}
                    </Link>
                  </div>

                  <p className="mt-1 text-sm text-neutral-700">
                    {claim.businessName} &middot; {claim.reason} &middot; wants{" "}
                    {CLAIM_RESOLUTION_LABELS[claim.requestedResolution].toLowerCase()}
                  </p>

                  <ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
                    {claim.lines.map((line, i) => (
                      <li key={`${line.sku}-${i}`}>
                        {line.name} ({line.sku}) — {line.claimedQty} of {line.billedQty} billed
                        units affected, {formatPrice(line.claimedQty * line.pricePerUnit)}
                      </li>
                    ))}
                  </ul>

                  {claim.comments && (
                    <p className="mt-2 rounded bg-neutral-50 p-2 text-xs italic text-neutral-600">
                      &ldquo;{claim.comments}&rdquo;
                    </p>
                  )}
                  {claim.decisionNote && (
                    <p className="mt-1.5 text-xs text-neutral-500">{claim.decisionNote}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-neutral-900">
                    {formatPrice(claimValue(claim))}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {claimedUnits(claim)} units claimed
                  </p>

                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {claim.status === "submitted" && (
                      <Button size="sm" variant="outline" onClick={() => review(claim)}>
                        <Search className="mr-1 h-3.5 w-3.5" /> Start review
                      </Button>
                    )}
                    {claim.status === "under_review" && (
                      <>
                        <Button size="sm" onClick={() => approve(claim)}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => reject(claim)}>
                          <X className="mr-1 h-3.5 w-3.5" /> Reject
                        </Button>
                      </>
                    )}
                    {claim.status === "approved" && (
                      <Button size="sm" onClick={() => settle(claim)}>
                        <PackageX className="mr-1 h-3.5 w-3.5" /> Mark settled
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
