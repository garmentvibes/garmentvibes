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
import { createReturnRequest } from "@/lib/returns/actions";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { notify } from "@/lib/stores/notification-store";
import { returnEligibility, INELIGIBLE_MESSAGES, RETURN_WINDOW_DAYS } from "@/lib/returns";
import { useCatalogue } from "@/components/shared/catalogue-provider";
import type { RetailProduct } from "@/types/catalog";

// Anything currently sellable can be exchanged into. Capped so the picker
// stays a picker rather than becoming a second catalogue — a customer
// wanting something further afield is better served returning and reordering.
// Derived per render rather than at module load, now that the catalogue comes
// from the server: a module-level const would freeze whatever the bundle was
// built with and never see a product going out of stock.
function exchangeableFrom(catalogue: RetailProduct[]) {
  return catalogue.filter((p) => p.sizes.some((s) => s.inStock)).slice(0, 20);
}
import { RETURN_REASONS, type ReturnReason, type ResolutionType } from "@/types/returns";

export default function ReturnRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const mounted = useHasMounted();
  const order = useRetailOrder(id);
  const existingReturns = useReturnsForOrder(id);
  const createReturnLocally = useReturnsStore((s) => s.create);

  const now = useNow();

  const [selected, setSelected] = useState<Record<number, number>>({});
  const [exchangeSizes, setExchangeSizes] = useState<Record<number, string>>({});
  const [exchangeProducts, setExchangeProducts] = useState<Record<number, string>>({});
  const [resolution, setResolution] = useState<ResolutionType>("refund");
  const [reason, setReason] = useState<ReturnReason>(RETURN_REASONS[0]);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Up here with the other hooks rather than beside the code that uses it:
  // there are three early returns between this point and there, and a hook
  // after any of them is a hook that runs in some renders and not others.
  //
  // Exchange prices are money, so they come from the catalogue the server last
  // read rather than from whatever the bundle happened to be built with.
  const catalogue = useCatalogue();

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

  const exchangeable = exchangeableFrom(catalogue);

  const chosen = order.items
    .map((item, i) => ({ item, qty: selected[i] ?? 0, index: i }))
    .filter((x) => x.qty > 0);
  const refundTotal = chosen.reduce((sum, x) => sum + x.qty * x.item.price, 0);

  // Positive: customer owes the difference. Negative: we refund it.
  const balance = chosen.reduce((sum, x) => {
    const replacementId = exchangeProducts[x.index] ?? x.item.productId;
    const replacementPrice =
      catalogue.find((p) => p.id === replacementId)?.price ?? x.item.price;
    return sum + x.qty * (replacementPrice - x.item.price);
  }, 0);

  async function submit() {
    if (chosen.length === 0) {
      toast.error(`Select at least one item to ${resolution === "exchange" ? "exchange" : "return"}`);
      return;
    }
    // An exchange with no replacement size chosen has nothing to send back.
    if (resolution === "exchange") {
      const missing = chosen.find(({ index }) => !exchangeSizes[index]);
      if (missing) {
        toast.error("Pick the size you'd like instead");
        return;
      }
    }
    setSubmitting(true);

    const draft = {
      orderId: order!.id,
      resolution,
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
        exchangeForSize: resolution === "exchange" ? exchangeSizes[x.index] : undefined,
        exchangeForProductId:
          resolution === "exchange" ? (exchangeProducts[x.index] ?? x.item.productId) : undefined,
        exchangeForPrice:
          resolution === "exchange"
            ? // Captured now, so a later price change can't retroactively
              // alter what the customer agreed to settle.
              catalogue.find((p) => p.id === (exchangeProducts[x.index] ?? x.item.productId))?.price
            : undefined,
      })),
      reason,
      comments: comments.trim() || undefined,
    };

    // The database first, where there is one. The insert policy from 0007
    // pins `status = 'requested'` in its WITH CHECK, so raising a return and
    // deciding one cannot be the same call however this page is written — and
    // the refund total is recomputed server-side rather than taken from here.
    const stored = await createReturnRequest(draft);

    if (stored.error) {
      setSubmitting(false);
      toast.error(stored.error);
      return;
    }

    // `notConfigured` means there was no database to write to, so the local
    // store is the record — which is what every QA suite here exercises.
    const request = stored.notConfigured
      ? createReturnLocally(draft)
      : { id: stored.reference! };

    notify({
      templateId: "return_requested",
      recipientName: order!.customerName,
      email: order!.customerEmail,
      phone: order!.phone,
      relatedTo: request.id,
      vars: { name: order!.customerName, orderId: order!.id, reason },
    });

    toast.success(
      resolution === "exchange"
        ? "Exchange request submitted — we'll review it within 2 business days"
        : "Return request submitted — we'll review it within 2 business days"
    );
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

      <h1 className="mt-3 text-xl font-bold text-neutral-900">Return or exchange</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Order <span className="font-mono">{order.id}</span> &middot; {eligibility.daysLeft}{" "}
        {eligibility.daysLeft === 1 ? "day" : "days"} left in your {RETURN_WINDOW_DAYS}-day window
        {eligibility.closesOn ? ` (closes ${eligibility.closesOn})` : ""}
      </p>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-neutral-900">What would you like?</h2>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              { value: "refund", title: "Refund", blurb: "Money back to your original payment method" },
              { value: "exchange", title: "Exchange", blurb: "Swap for a different size of the same item" },
            ] as Array<{ value: ResolutionType; title: string; blurb: string }>
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setResolution(option.value)}
              aria-pressed={resolution === option.value}
              className={`rounded-lg border p-3 text-left ${
                resolution === option.value
                  ? "border-rose-600 bg-rose-50"
                  : "border-neutral-300 hover:border-neutral-400"
              }`}
            >
              <p className="text-sm font-medium text-neutral-900">{option.title}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{option.blurb}</p>
            </button>
          ))}
        </div>
      </section>

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

                {resolution === "exchange" && (selected[i] ?? 0) > 0 && (
                  <>
                    <Label htmlFor={`swap-product-${i}`} className="text-xs text-neutral-500">
                      Swap for
                    </Label>
                    <select
                      id={`swap-product-${i}`}
                      value={exchangeProducts[i] ?? item.productId}
                      onChange={(e) => {
                        setExchangeProducts((prev) => ({ ...prev, [i]: e.target.value }));
                        // The old size may not exist on the new product, so
                        // clear it rather than carry an invalid choice over.
                        setExchangeSizes((prev) => ({ ...prev, [i]: "" }));
                      }}
                      className="max-w-[12rem] rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none"
                    >
                      <option value={item.productId}>Same item</option>
                      {exchangeable.filter((p) => p.id !== item.productId).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {formatPrice(p.price)}
                        </option>
                      ))}
                    </select>

                    <select
                      id={`swap-${i}`}
                      aria-label={`Replacement size for ${item.name}`}
                      value={exchangeSizes[i] ?? ""}
                      onChange={(e) =>
                        setExchangeSizes((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none"
                    >
                      <option value="">Size…</option>
                      {/* Only sizes we can actually send. On a same-product
                          swap the original size is excluded, since that's
                          not an exchange. */}
                      {(catalogue.find((p) => p.id === (exchangeProducts[i] ?? item.productId))
                        ?.sizes ?? [])
                        .filter(
                          (s) =>
                            s.inStock &&
                            !(
                              (exchangeProducts[i] ?? item.productId) === item.productId &&
                              s.label === item.size
                            )
                        )
                        .map((s) => (
                          <option key={s.label} value={s.label}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                  </>
                )}
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
          <span className="text-neutral-600">
            {resolution === "exchange" ? "Value being exchanged" : "Estimated refund"}
          </span>
          <span className="font-semibold text-neutral-900">{formatPrice(refundTotal)}</span>
        </div>
        {resolution === "exchange" && balance !== 0 && (
          <div className="mt-1.5 flex items-center justify-between border-t border-neutral-200 pt-1.5 text-sm">
            <span className="text-neutral-600">
              {balance > 0 ? "Difference to pay" : "Difference refunded to you"}
            </span>
            <span
              className={`font-semibold ${balance > 0 ? "text-neutral-900" : "text-green-700"}`}
            >
              {formatPrice(Math.abs(balance))}
            </span>
          </div>
        )}

        <p className="mt-2 flex items-start gap-1.5 text-xs text-neutral-500">
          <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Items must be unused with original tags and packaging. Pickup is free.{" "}
          {resolution === "exchange"
            ? balance > 0
              ? "The replacement ships once the original reaches us and the difference is paid."
              : balance < 0
                ? "The replacement ships once the original reaches us, and we'll refund the difference to your original payment method."
                : "The replacement ships once the original reaches us and passes a quick check. A like-for-like swap costs nothing extra."
            : "The refund is issued once the item reaches us and passes a quick check."}
        </p>
      </div>

      <Button className="mt-4 w-full" onClick={submit} disabled={submitting}>
        Submit {resolution === "exchange" ? "exchange" : "return"} request
      </Button>
    </div>
  );
}
