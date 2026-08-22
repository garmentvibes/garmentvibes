"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, X, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminAccountsStore, useWholesaleAccounts } from "@/lib/stores/admin-accounts-store";
import { notify } from "@/lib/stores/notification-store";
import type { WholesaleAccount } from "@/types/admin";

type Filter = "all" | "pending" | "approved" | "rejected";

const STATUS_VARIANT = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
} as const;

export default function AdminAccountsPage() {
  const accounts = useWholesaleAccounts();
  const setStatus = useAdminAccountsStore((s) => s.setStatus);
  const setPaymentTerms = useAdminAccountsStore((s) => s.setPaymentTerms);
  const [filter, setFilter] = useState<Filter>("pending");

  const visible = accounts.filter((a) => filter === "all" || a.status === filter);
  const pendingCount = accounts.filter((a) => a.status === "pending").length;

  function approve(account: WholesaleAccount) {
    setStatus(account.id, "approved");
    notify({
      templateId: "wholesale_account_approved",
      recipientName: account.contactName,
      email: account.email,
      phone: account.phone,
      relatedTo: account.id,
      vars: { name: account.contactName, businessName: account.businessName },
    });
    toast.success(`${account.businessName} approved — they can now place orders directly`);
  }

  function reject(account: WholesaleAccount) {
    setStatus(account.id, "rejected");
    notify({
      templateId: "wholesale_account_rejected",
      recipientName: account.contactName,
      email: account.email,
      phone: account.phone,
      relatedTo: account.id,
      vars: { name: account.contactName, businessName: account.businessName },
    });
    toast.success(`${account.businessName} rejected`);
  }

  function grantNet30(account: WholesaleAccount) {
    setPaymentTerms(account.id, "net30");
    notify({
      templateId: "credit_terms_approved",
      recipientName: account.contactName,
      email: account.email,
      relatedTo: account.id,
      vars: { name: account.contactName, businessName: account.businessName },
    });
    toast.success(`Net-30 terms granted to ${account.businessName}`);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold text-neutral-900">Wholesale Accounts</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Approve business registrations and manage payment terms. Pending accounts can browse and
        request quotes, but can&apos;t place orders directly until approved.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
              filter === f
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
            }`}
          >
            {f}
            {f === "pending" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-neutral-300 bg-white py-12 text-center text-sm text-neutral-500">
          No {filter === "all" ? "" : filter} accounts.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((account) => (
            <div key={account.id} className="rounded-lg border border-neutral-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-neutral-900">{account.businessName}</h2>
                    <Badge variant={STATUS_VARIANT[account.status]} className="capitalize">
                      {account.status}
                    </Badge>
                    <Badge variant="outline">
                      {account.paymentTerms === "net30" ? "Net 30" : "Prepay"}
                    </Badge>
                    {account.creditTermsRequested && account.paymentTerms !== "net30" && (
                      <Badge variant="warning">Net-30 requested</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">
                    {account.contactName} &middot; {account.email}
                    {account.phone ? ` · ${account.phone}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    Registered {account.registeredAt}
                    {account.gstin ? ` · GSTIN ${account.gstin}` : " · no GSTIN provided"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {account.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => approve(account)}>
                        <Check className="mr-1 h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reject(account)}>
                        <X className="mr-1 h-4 w-4" /> Reject
                      </Button>
                    </>
                  )}
                  {account.status === "approved" && account.paymentTerms !== "net30" && (
                    <Button size="sm" variant="outline" onClick={() => grantNet30(account)}>
                      <CreditCard className="mr-1 h-4 w-4" /> Grant Net-30
                    </Button>
                  )}
                  {account.status === "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => approve(account)}>
                      Reinstate
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
