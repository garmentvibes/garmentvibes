"use client";

import { useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStockStore, getStock } from "@/lib/stores/stock-store";
import { useStockAlertsStore } from "@/lib/stores/stock-alerts-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import type { RetailProduct } from "@/types/catalog";

/**
 * "Tell me when it's back" for sold-out sizes.
 *
 * Kept separate from the size selector rather than making sold-out sizes
 * selectable: those stay disabled so nobody can put an unavailable variant
 * in their bag, which is a deliberate decision the QA suite pins down.
 */
export function BackInStockNotify({ product }: { product: RetailProduct }) {
  const mounted = useHasMounted();
  const overrides = useStockStore((s) => s.overrides);
  const subscribe = useStockAlertsStore((s) => s.subscribe);
  const user = useSessionStore((s) => s.user);

  const [size, setSize] = useState("");
  const [email, setEmail] = useState("");

  if (!mounted) return null;

  const soldOut = product.sizes.filter((s) => getStock(overrides, product, s.label) === 0);
  if (soldOut.length === 0) return null;

  const effectiveEmail = (email || user?.email || "").trim();

  function submit() {
    const chosen = size || soldOut[0].label;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(effectiveEmail)) {
      toast.error("Enter a valid email address");
      return;
    }
    const added = subscribe({
      productId: product.id,
      size: chosen,
      email: effectiveEmail,
      name: user?.name ?? effectiveEmail.split("@")[0],
    });
    toast[added ? "success" : "info"](
      added
        ? `We'll email you when size ${chosen} is back`
        : `You're already on the list for size ${chosen}`
    );
    setEmail("");
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-neutral-900">
        <BellRing className="h-4 w-4 text-neutral-400" />
        Sold out in your size?
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        We&apos;ll email you once it&apos;s back. One message per size, nothing else.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="notify-size" className="text-xs">
            Size
          </Label>
          <select
            id="notify-size"
            value={size || soldOut[0].label}
            onChange={(e) => setSize(e.target.value)}
            className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-2 text-sm focus:border-rose-400 focus:outline-none"
          >
            {soldOut.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="notify-email" className="text-xs">
            Email
          </Label>
          <Input
            id="notify-email"
            type="email"
            value={email || user?.email || ""}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-1"
          />
        </div>

        <Button size="sm" variant="outline" onClick={submit}>
          Notify me
        </Button>
      </div>
    </div>
  );
}
