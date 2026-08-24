"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Tag, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useManagedPromos } from "@/lib/hooks/use-managed-promos";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useNow } from "@/lib/hooks/use-now";

export default function AdminPromosPage() {
  const mounted = useHasMounted();
  const now = useNow();
  const { codes, live, create: createCode, setActive, remove } = useManagedPromos();

  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("10");
  const [expiresOn, setExpiresOn] = useState("");
  // Default to a capped code. An uncapped percentage code can be posted
  // publicly and used without end — the safer default is the one that costs
  // a deliberate act to remove, not one to add.
  const [maxRedemptions, setMaxRedemptions] = useState("100");
  const [maxPerCustomer, setMaxPerCustomer] = useState("1");

  if (!mounted || now === null) return null;

  // A const arrow rather than a function declaration: declarations hoist
  // above the `now === null` guard, so TypeScript can't see it narrowed.
  //
  // The rules live in parsePromoForm so that the same ones run here, for
  // immediate feedback, and again in the server action, where they bind.
  const create = async () => {
    const error = await createCode({ code, percent, expiresOn, maxRedemptions, maxPerCustomer });

    if (error) {
      toast.error(error);
      return;
    }

    setCode("");
    setExpiresOn("");
    toast.success(`${code.trim().toUpperCase()} created`);
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

      {/*
        Worth saying out loud rather than leaving an admin to discover it. Until
        this page wrote to the database, every code lived in one browser's
        localStorage — so a colleague on another machine saw a different set,
        and nobody could tell from looking. On a deployment with no database
        that is still the situation, and this is the sentence that explains why
        a code created here is not on the shop floor's laptop.
      */}
      {!live && (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          These codes are saved in this browser only. They are not shared with other
          staff, and clearing site data removes them.
        </p>
      )}

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
          <div>
            <Label htmlFor="promo-max-total">Total uses</Label>
            <Input
              id="promo-max-total"
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="blank = unlimited"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="promo-max-each">Uses per customer</Label>
            <Input
              id="promo-max-each"
              type="number"
              min={1}
              value={maxPerCustomer}
              onChange={(e) => setMaxPerCustomer(e.target.value)}
              placeholder="blank = unlimited"
              className="mt-1"
            />
          </div>
          <Button size="sm" onClick={() => void create()}>
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
                  {promo.issuedTo && <Badge variant="outline">Referral reward</Badge>}
                  {promo.maxRedemptions === undefined && promo.maxPerCustomer === undefined && (
                    <Badge variant="warning">Uncapped</Badge>
                  )}
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
                <p className="mt-1 text-xs text-neutral-400">
                  Used {promo.redemptions}
                  {promo.maxRedemptions !== undefined
                    ? ` of ${promo.maxRedemptions}`
                    : " times · no total cap"}
                  {promo.maxPerCustomer !== undefined
                    ? ` · ${promo.maxPerCustomer} per customer`
                    : " · unlimited per customer"}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const error = await setActive(promo.code, !promo.active);
                    if (error) toast.error(error);
                  }}
                >
                  {promo.active ? "Deactivate" : "Activate"}
                </Button>
                {!promo.builtIn && (
                  <Button
                    size="sm"
                    variant="destructive"
                    aria-label={`Delete ${promo.code}`}
                    onClick={async () => {
                      const error = await remove(promo.code);
                      if (error) {
                        toast.error(error);
                        return;
                      }
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
