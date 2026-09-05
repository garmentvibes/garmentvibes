"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, X } from "lucide-react";

import { useCartStore, cartTotals } from "@/lib/stores/cart-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";
import { describeAge, recoveryPrompt } from "@/lib/abandoned-cart";
import { formatPrice } from "@/lib/utils";
import { track } from "@/lib/analytics";

/**
 * "You left something in your bag" for a customer who comes back.
 *
 * This is the half of abandoned-cart recovery that works without a server:
 * the customer is here, so nothing needs to be delivered to them. The
 * message sequence in abandoned-cart.ts covers the other half and is waiting
 * on carts living in the database — see the note at the top of that file.
 */
export function CartRecoveryPrompt() {
  const mounted = useHasMounted();
  const now = useNow();
  const [dismissedThisVisit, setDismissedThisVisit] = useState(false);

  const lines = useCartStore((s) => s.lines);
  const updatedAt = useCartStore((s) => s.updatedAt);
  const promptDismissedAt = useCartStore((s) => s.promptDismissedAt);
  const dismissPrompt = useCartStore((s) => s.dismissPrompt);

  // Rendering before the persisted cart has hydrated would flash the prompt
  // for someone with an empty bag, and `now` is null until the clock hook
  // settles on the client.
  if (!mounted || now === null || dismissedThisVisit) return null;

  // Dismissing is a decision about this cart, not this page load. Re-asking
  // on every navigation is how a helpful nudge becomes an irritation.
  if (promptDismissedAt !== undefined && updatedAt !== undefined && promptDismissedAt >= updatedAt) {
    return null;
  }

  const show = recoveryPrompt(
    { lineCount: lines.length, updatedAt, remindersSent: 0 },
    now
  );
  if (!show || updatedAt === undefined) return null;

  const { totalItems, totalPrice } = cartTotals(lines);

  function dismiss() {
    setDismissedThisVisit(true);
    dismissPrompt();
  }

  return (
    <div
      role="status"
      className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm sm:px-6"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <ShoppingBag className="h-5 w-5 shrink-0 text-rose-600" />
        <p className="min-w-0 flex-1 text-neutral-700">
          <span className="font-medium text-neutral-900">
            {totalItems} item{totalItems === 1 ? "" : "s"} still in your bag
          </span>{" "}
          <span className="text-neutral-500">
            · {formatPrice(totalPrice)} · saved {describeAge(now - updatedAt)} ago
          </span>
        </p>
        <Link
          href="/shop/cart"
          onClick={() => track({ name: "cart_recovered", itemCount: totalItems, value: totalPrice })}
          className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
        >
          View bag
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 text-neutral-500 hover:text-neutral-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
