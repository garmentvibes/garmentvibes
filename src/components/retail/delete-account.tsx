"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eraseMyAccount } from "@/lib/account/erase";
import { useSignOut } from "@/lib/hooks/use-sign-out";

// ---------------------------------------------------------------------------
// "Delete my account", on the account page.
//
// Apple's guideline 5.1.1(v) wants this reachable from inside the app rather
// than by emailing somebody, and India's DPDP Act s.12 gives the same right in
// law. So it lives here, two taps from the account page, and not behind a
// support form.
//
// ---------------------------------------------------------------------------
// Why it asks you to type the word
// ---------------------------------------------------------------------------
//
// The guideline says the path must be easy to find, not that it must be easy
// to trigger by accident. This is the one irreversible button in the
// storefront — there is no undo, because the undo would be a copy of the data
// we just promised to destroy — and it sits directly below "Sign out" on a
// phone. A confirmation you can dismiss by tapping in the wrong place is not
// one; typing a word is deliberate in a way that a second tap is not.
//
// ---------------------------------------------------------------------------
// Why the receipt is shown rather than a toast
// ---------------------------------------------------------------------------
//
// Because it says something the customer has a right to know and would not
// otherwise learn: their orders are kept. Erasure under DPDP is subject to
// s.8(7) — retention where another law requires it — and CGST Rule 56 requires
// invoices for 72 months. Deleting the account without saying that would be
// technically compliant and quietly misleading, so the exact counts come back
// from the database and are put on screen before the session ends.
// ---------------------------------------------------------------------------

const CONFIRMATION = "DELETE";

export function DeleteAccount() {
  const router = useRouter();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<{
    erased: Record<string, number>;
    orders_retained: number;
    retained_because: string;
  } | null>(null);

  // Shown after the account is gone, in place of everything else. The session
  // is already ended by this point, so there is nothing to go back to.
  if (receipt) {
    const erasedCount = Object.values(receipt.erased).reduce((n, v) => n + v, 0);

    return (
      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold text-neutral-900">Your account is deleted</h2>
        <p className="mt-2 text-sm text-neutral-600">
          We removed your sign-in and {erasedCount}{" "}
          {erasedCount === 1 ? "saved item" : "saved items"} — your bag, wishlist, saved
          addresses, reviews and alerts.
        </p>
        {receipt.orders_retained > 0 && (
          <p className="mt-3 text-sm text-neutral-600">
            {receipt.orders_retained === 1
              ? "One past order is kept"
              : `${receipt.orders_retained} past orders are kept`}{" "}
            with its invoice, as GST law requires. It is no longer linked to any account.
          </p>
        )}
        <Button variant="retail" className="mt-4 w-full" onClick={() => router.push("/shop")}>
          Back to shopping
        </Button>
      </div>
    );
  }

  function confirm() {
    startTransition(async () => {
      const result = await eraseMyAccount();

      if (result.notConfigured) {
        toast.error("Account deletion is not available on this deployment");
        return;
      }

      if (result.error) {
        // The refusals name what has to happen first — an order still to
        // arrive, a return still open — so they are shown as written rather
        // than replaced with a generic failure.
        toast.error(result.error);
        return;
      }

      // Ends the session and clears the local stores. The account is already
      // gone server-side; this is what stops the browser still believing in it.
      await signOut();
      setReceipt(result.receipt ?? null);
    });
  }

  return (
    <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
        <TriangleAlert className="h-4 w-4 text-neutral-400" />
        Delete my account
      </h2>
      <p className="mt-2 text-sm text-neutral-600">
        This removes your sign-in, saved addresses, bag, wishlist, reviews and alerts. It
        cannot be undone.
      </p>
      <p className="mt-2 text-sm text-neutral-500">
        Past orders and their invoices are kept, because GST law requires us to hold them.
        They stop being linked to any account.
      </p>

      {open ? (
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="confirm-delete" className="text-xs">
              Type {CONFIRMATION} to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRMATION}
              autoComplete="off"
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={typed.trim().toUpperCase() !== CONFIRMATION || pending}
              onClick={confirm}
            >
              {pending ? "Deleting…" : "Delete my account"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      )}
    </div>
  );
}
