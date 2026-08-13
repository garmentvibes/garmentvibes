"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { useRetailOrder } from "@/lib/stores/admin-orders-store";
import { useReturnsStore, useReturnsForOrder } from "@/lib/stores/returns-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { notify } from "@/lib/stores/notification-store";
import { returnEligibility, INELIGIBLE_MESSAGES, RETURN_WINDOW_DAYS } from "@/lib/returns";
import { RETURN_REASONS, type ReturnReason } from "@/types/returns";

export default function ReturnRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const mounted = useHasMounted();
  const order = useRetailOrder(id);
  const existingReturns = useReturnsForOrder(id);
  const createReturn = useReturnsStore((s) => s.create);

  const now = useNow();

  const [selected, setSelected] = useState<Record<number, number>>({});
  const [reason, setReason] = useState<ReturnReason>(RETURN_REASONS[0]);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!mounted || now === null) return null;

  if (!order) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="text-neutral-500">Order not found.</p>
        <Link href="/shop/orders" className="mt-4 inline-block text-sm text-rose-600 underline">
          Back to my orders
        </Link>
      </div>
    );
  }

  const eligibility = returnEligibility(order, existingReturns, now);

  if (!eligibility.eligible) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Link
          href={`/shop/orders/${order.id}`}
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-rose-600"
        >
          <ArrowLeft className="h-4 w-4" /> Back to order
        </Link>
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-8 text-center">
          <h1 className="text-lg font-bold text-neutral-900">Return not available</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600">
            {INELIGIBLE_MESSAGES[eligibility.reason!]}
          </p>
          <Link
            href="/shop/refund-policy"
            className="mt-4 inline-block text-sm text-rose-600 underline"
          >
            Read the refund &amp; cancellation policy
          </Link>
        </div>
      </div>
    );
  }

  const chosen = order.items
    .map((item, i) => ({ item, qty: selected[i] ?? 0 }))
    .filter((x) => x.qty > 0);
  const refundTotal = chosen.reduce((sum, x) => sum + x.qty * x.item.price, 0);

  function submit() {
    if (chosen.length === 0) {
      toast.error("Select at least one item to return");
      return;
    }
    setSubmitting(true);

    const request = createReturn({
      orderId: order!.id,
      customerName: order!.customerName,
      customerEmail: order!.customerEmail,
      phone: order!.phone,
      items: chosen.map((x) => ({
        productId: x.item.productId,
        name: x.item.name,
        size: x.item.size,
        color: x.item.color,
        qty: x.qty,
        price: x.item.price,
      })),
      reason,
      comments: comments.trim() || undefined,
    });

    notify({
      templateId: "return_requested",
      recipientName: order!.customerName,
      email: order!.customerEmail,
      phone: order!.phone,
      relatedTo: request.id,
      vars: { name: order!.customerName, orderId: order!.id, reason },
    });

    toast.success("Return request submitted — we'll review it within 2 business days");
    router.push(`/shop/orders/${order!.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/shop/orders/${order.id}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-rose-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to order
      </Link>

      <h1 className="mt-3 text-xl font-bold text-neutral-900">Request a return</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Order <span className="font-mono">{order.id}</span> &middot; {eligibility.daysLeft}{" "}
        {eligibility.daysLeft === 1 ? "day" : "days"} left in your {RETURN_WINDOW_DAYS}-day window
        {eligibility.closesOn ? ` (closes ${eligibility.closesOn})` : ""}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">Which items?</h2>
        <ul className="mt-2 space-y-2">
          {order.items.map((item, i) => (
            <li
              key={`${item.productId}-${i}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
            >
              <div className="min-w-0">
                <p className="text-sm text-neutral-800">{item.name}</p>
                <p className="text-xs text-neutral-400">
                  Size {item.size} &middot; {item.color} &middot; {formatPrice(item.price)} each
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`qty-${i}`} className="text-xs text-neutral-500">
                  Return qty
                </Label>
                <select
                  id={`qty-${i}`}
                  value={selected[i] ?? 0}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [i]: Number(e.target.value) }))
                  }
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none"
                >
                  {/* Capped at the quantity actually purchased. */}
                  {Array.from({ length: item.qty + 1 }, (_, n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <Label htmlFor="reason">Reason</Label>
        <select
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReturnReason)}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
        >
          {RETURN_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-4">
        <Label htmlFor="comments">Anything else? (optional)</Label>
        <textarea
          id="comments"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
          placeholder="Tell us a bit more, so we can sort it out faster."
        />
      </section>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-600">Estimated refund</span>
          <span className="font-semibold text-neutral-900">{formatPrice(refundTotal)}</span>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-500">
          <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Items must be unused with original tags and packaging. Pickup is free. The refund is
          issued once the item reaches us and passes a quick check.
        </p>
      </div>

      <Button className="mt-4 w-full" onClick={submit} disabled={submitting}>
        Submit return request
      </Button>
    </div>
  );
}
