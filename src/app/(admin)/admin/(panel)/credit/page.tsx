"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, IndianRupee } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatPrice } from "@/lib/utils";
import { useCreditStore } from "@/lib/stores/credit-store";
import { useCreditLedger } from "@/lib/hooks/use-credit-ledger";
import { recordCreditPayment, writeOffCreditInvoice } from "@/lib/admin/credit/actions";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { notify } from "@/lib/stores/notification-store";
import {
  AGEING_BUCKETS,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  ageingBucket,
  amountOutstanding,
  amountPaid,
  daysOverdue,
  isOverdue,
  type CreditInvoice,
  type CreditPayment,
} from "@/types/credit";

type Filter = "outstanding" | "overdue" | "paid" | "all";

export default function AdminCreditPage() {
  const mounted = useHasMounted();
  const now = useNow();
  const { invoices, loaded, live, refresh } = useCreditLedger();
  const recordPayment = useCreditStore((s) => s.recordPayment);
  const writeOff = useCreditStore((s) => s.writeOff);

  const [filter, setFilter] = useState<Filter>("outstanding");
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<CreditPayment["method"]>("bank_transfer");
  const [payReference, setPayReference] = useState("");

  if (!mounted || now === null) return null;

  // A ledger that renders empty while the answer is in flight reads as
  // "nobody owes us anything", which is the wrong thing for a finance screen
  // to say for even a moment.
  if (!loaded) {
    return <p className="py-16 text-center text-neutral-400">Loading the ledger…</p>;
  }

  const visible = invoices.filter((i) => {
    if (filter === "all") return true;
    if (filter === "paid") return i.status === "paid" || i.status === "written_off";
    if (filter === "overdue") return isOverdue(i, now);
    return amountOutstanding(i) > 0;
  });

  const totalOutstanding = invoices.reduce((sum, i) => sum + amountOutstanding(i), 0);
  const totalOverdue = invoices
    .filter((i) => isOverdue(i, now))
    .reduce((sum, i) => sum + amountOutstanding(i), 0);

  // Ageing summary — the view a finance person actually asks for.
  const ageing = AGEING_BUCKETS.map((bucket) => ({
    bucket,
    total: invoices
      .filter((i) => amountOutstanding(i) > 0 && ageingBucket(daysOverdue(i, now)) === bucket)
      .reduce((sum, i) => sum + amountOutstanding(i), 0),
  }));

  const submitPayment = (invoice: CreditInvoice) => {
    const rupees = Number(payAmount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast.error("Enter a payment amount");
      return;
    }
    const minor = Math.round(rupees * 100);
    const outstanding = amountOutstanding(invoice);
    // Overpaying is almost always a typo, and it would make the ledger lie.
    if (minor > outstanding) {
      toast.error(`That's more than the ${formatPrice(outstanding)} outstanding`);
      return;
    }

    const receipt = {
      amount: minor,
      receivedOn: new Date(now).toISOString().slice(0, 10),
      method: payMethod,
      reference: payReference.trim() || undefined,
    };

    const clearForm = () => {
      setPayingId(null);
      setPayAmount("");
      setPayReference("");
    };

    if (live) {
      // The insert is the whole write: 0008 derives the invoice status from
      // its payments with a trigger, so open → part_paid → paid follows on its
      // own and cannot disagree with the arithmetic underneath it.
      void recordCreditPayment(invoice.id, receipt).then((result) => {
        if (result.error) {
          toast.error(result.error);
          return;
        }
        clearForm();
        refresh();
        toast.success(`${formatPrice(minor)} recorded against ${invoice.id}`);
      });
      return;
    }

    recordPayment(invoice.id, receipt);
    clearForm();
    toast.success(`${formatPrice(minor)} recorded against ${invoice.id}`);
  };

  // A const arrow, not a declaration: declarations hoist above the
  // `now === null` guard so TypeScript can't see it narrowed.
  const chase = (invoice: CreditInvoice) => {
    notify({
      templateId: "payment_overdue",
      recipientName: invoice.contactName,
      email: invoice.email,
      relatedTo: invoice.id,
      vars: {
        name: invoice.contactName,
        orderId: invoice.id,
        amount: formatPrice(amountOutstanding(invoice)),
        businessName: invoice.businessName,
        reason: `${daysOverdue(invoice, now)} days past due`,
      },
    });
    toast.success(`Reminder queued for ${invoice.businessName}`);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-neutral-900">Credit ledger</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Net-30 invoices for wholesale accounts on credit terms — what&apos;s outstanding,
        what&apos;s overdue, and who to chase.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">
            {formatPrice(totalOutstanding)}
          </p>
        </div>
        <div
          className={cn(
            "rounded-lg border p-4",
            totalOverdue > 0 ? "border-red-200 bg-red-50" : "border-neutral-200 bg-white"
          )}
        >
          <p className="text-xs uppercase tracking-wide text-neutral-400">Overdue</p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold",
              totalOverdue > 0 ? "text-red-700" : "text-neutral-900"
            )}
          >
            {formatPrice(totalOverdue)}
          </p>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[32rem] text-sm">
          <caption className="px-4 pt-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Ageing
          </caption>
          <thead>
            <tr className="text-left text-xs text-neutral-400">
              {ageing.map((a) => (
                <th key={a.bucket} className="px-4 py-2 font-medium">
                  {a.bucket === "current" ? "Within terms" : `${a.bucket} days`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {ageing.map((a) => (
                <td
                  key={a.bucket}
                  className={cn(
                    "px-4 pb-3 font-semibold",
                    a.bucket !== "current" && a.total > 0 ? "text-red-700" : "text-neutral-800"
                  )}
                >
                  {formatPrice(a.total)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {(["outstanding", "overdue", "paid", "all"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm capitalize",
              filter === f
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">No invoices match this filter.</p>
      ) : (
        <ul id="credit-list" className="mt-5 space-y-3">
          {visible.map((invoice) => {
            const outstanding = amountOutstanding(invoice);
            const overdueDays = daysOverdue(invoice, now);
            const overdue = isOverdue(invoice, now);
            return (
              <li
                key={invoice.id}
                className={cn(
                  "rounded-lg border bg-white p-4",
                  overdue ? "border-red-200" : "border-neutral-200"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-neutral-900">
                        {invoice.id}
                      </span>
                      <Badge
                        variant={
                          invoice.status === "paid"
                            ? "success"
                            : overdue
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {INVOICE_STATUS_LABELS[invoice.status]}
                      </Badge>
                      <Link
                        href={`/admin/quotes/${invoice.orderId}`}
                        className="font-mono text-xs text-neutral-500 underline hover:text-neutral-800"
                      >
                        {invoice.orderId}
                      </Link>
                    </div>

                    <p className="mt-1 text-sm text-neutral-700">{invoice.businessName}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      Issued {invoice.issuedOn} &middot; due {invoice.dueOn}
                      {overdue && (
                        <span className="ml-1 font-medium text-red-700">
                          — {overdueDays} {overdueDays === 1 ? "day" : "days"} past due
                        </span>
                      )}
                    </p>

                    {invoice.payments.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-neutral-500">
                        {invoice.payments.map((p) => (
                          <li key={p.id}>
                            {formatPrice(p.amount)} on {p.receivedOn} &middot;{" "}
                            {PAYMENT_METHOD_LABELS[p.method]}
                            {p.reference ? ` (${p.reference})` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-neutral-900">
                      {formatPrice(outstanding)}
                    </p>
                    <p className="text-xs text-neutral-400">
                      of {formatPrice(invoice.amount)}
                      {amountPaid(invoice) > 0 && ` · ${formatPrice(amountPaid(invoice))} paid`}
                    </p>

                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      {outstanding > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPayingId(payingId === invoice.id ? null : invoice.id);
                            setPayAmount(String(Math.round(outstanding / 100)));
                          }}
                        >
                          <IndianRupee className="mr-1 h-3.5 w-3.5" /> Record payment
                        </Button>
                      )}
                      {overdue && (
                        <Button size="sm" variant="destructive" onClick={() => chase(invoice)}>
                          <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Send reminder
                        </Button>
                      )}
                      {overdue && overdueDays > 90 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (live) {
                              void writeOffCreditInvoice(invoice.id).then((result) => {
                                if (result.error) {
                                  toast.error(result.error);
                                  return;
                                }
                                refresh();
                                toast.success(`${invoice.id} written off`);
                              });
                              return;
                            }

                            writeOff(invoice.id);
                            toast.success(`${invoice.id} written off`);
                          }}
                        >
                          Write off
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {payingId === invoice.id && (
                  <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:grid-cols-[8rem_10rem_1fr_auto] sm:items-end">
                    <div>
                      <Label htmlFor={`amount-${invoice.id}`} className="text-xs">
                        Amount (₹)
                      </Label>
                      <Input
                        id={`amount-${invoice.id}`}
                        type="number"
                        min={1}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`method-${invoice.id}`} className="text-xs">
                        Method
                      </Label>
                      <select
                        id={`method-${invoice.id}`}
                        value={payMethod}
                        onChange={(e) =>
                          setPayMethod(e.target.value as CreditPayment["method"])
                        }
                        className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-2 text-sm focus:border-neutral-500 focus:outline-none"
                      >
                        {(
                          Object.keys(PAYMENT_METHOD_LABELS) as Array<CreditPayment["method"]>
                        ).map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label htmlFor={`ref-${invoice.id}`} className="text-xs">
                        Reference (optional)
                      </Label>
                      <Input
                        id={`ref-${invoice.id}`}
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        placeholder="NEFT/UTR number"
                        className="mt-1"
                      />
                    </div>
                    <Button size="sm" onClick={() => submitPayment(invoice)}>
                      Save
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
