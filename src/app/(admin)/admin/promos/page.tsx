"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Tag, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePromoStore } from "@/lib/stores/promo-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";

export default function AdminPromosPage() {
  const mounted = useHasMounted();
  const now = useNow();
  const codes = usePromoStore((s) => s.codes);
  const add = usePromoStore((s) => s.add);
  const toggle = usePromoStore((s) => s.toggle);
  const remove = usePromoStore((s) => s.remove);

  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [expiresOn, setExpiresOn] = useState("");

  if (!mounted || now === null) return null;

  // A const arrow rather than a function declaration: declarations hoist
  // above the `now === null` guard, so TypeScript can't see it narrowed.
  const create = () => {
    const normalised = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(normalised)) {
      toast.error("Codes are 3-20 characters, letters and numbers only");
      return;
    }
    const pct = Number(percent);
    // A 0% code does nothing and a 100% code gives the order away — both are
    // almost certainly typos rather than intent.
    if (!Number.isFinite(pct) || pct < 1 || pct > 90) {
      toast.error("Discount must be between 1% and 90%");
      return;
    }
    if (expiresOn && new Date(expiresOn).getTime() < now) {
      toast.error("Expiry date is in the past");
      return;
    }

    add({ code: normalised, percent: pct, active: true, expiresOn: expiresOn || undefined });
    setCode("");
    setExpiresOn("");
    toast.success(`${normalised} created`);
  };

  const isExpired = (expiry?: string) =>
    Boolean(expiry && new Date(expiry).getTime() < now);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold text-neutral-900">Promo codes</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Codes customers can apply at checkout. Built-in codes ship with the app and can be
        switched off but not deleted.
      </p>

      <div className="mt-5 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-neutral-900">Create a code</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_11rem_auto] sm:items-end">
          <div>
            <Label htmlFor="promo-code">Code</Label>
            <Input
              id="promo-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="FESTIVE20"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="promo-percent">Discount %</Label>
            <Input
              id="promo-percent"
              type="number"
              min={1}
              max={90}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="promo-expiry">Expires (optional)</Label>
            <Input
              id="promo-expiry"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button size="sm" onClick={create}>
            Create
          </Button>
        </div>
      </div>

      <ul id="promo-list" className="mt-5 space-y-2">
        {codes.map((promo) => {
          const expired = isExpired(promo.expiresOn);
          return (
            <li
              key={promo.code}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Tag className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="font-mono text-sm font-semibold text-neutral-900">
                    {promo.code}
                  </span>
                  <span className="text-sm text-neutral-600">{promo.percent}% off</span>
                  {promo.builtIn && <Badge variant="outline">Built-in</Badge>}
                  {expired ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <Badge variant={promo.active ? "success" : "warning"}>
                      {promo.active ? "Active" : "Inactive"}
                    </Badge>
                  )}
                </div>
                {promo.expiresOn && (
                  <p className="mt-1 text-xs text-neutral-400">
                    {expired ? "Expired on" : "Expires"} {promo.expiresOn}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" onClick={() => toggle(promo.code)}>
                  {promo.active ? "Deactivate" : "Activate"}
                </Button>
                {!promo.builtIn && (
                  <Button
                    size="sm"
                    variant="destructive"
                    aria-label={`Delete ${promo.code}`}
                    onClick={() => {
                      remove(promo.code);
                      toast.success(`${promo.code} deleted`);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
