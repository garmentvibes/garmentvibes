"use client";

import { useCallback, useEffect, useState } from "react";
import { allCreditInvoices } from "@/lib/admin/credit/reads";
import { useCreditStore } from "@/lib/stores/credit-store";
import type { CreditInvoice } from "@/types/credit";

// ---------------------------------------------------------------------------
// The credit ledger, from the database when there is one.
//
// Same shape as the other admin hooks. The fallback matters here for the usual
// reason — every QA suite in this repo runs with no Supabase project — but the
// live path matters more than on any other screen: this is the one that tells
// somebody how much a business owes.
// ---------------------------------------------------------------------------

export interface CreditLedger {
  invoices: CreditInvoice[];
  loaded: boolean;
  live: boolean;
  /** Re-reads after a write; `revalidatePath` cannot reach this state. */
  refresh: () => void;
}

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function useCreditLedger(): CreditLedger {
  const seeded = useCreditStore((s) => s.invoices);

  const [state, setState] = useState<{ invoices: CreditInvoice[]; live: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    allCreditInvoices()
      .then((result) => {
        if (!cancelled) setState({ invoices: result.invoices, live: result.live });
      })
      .catch(() => {
        // Live-empty, not the seed. Fictional debts in front of somebody about
        // to chase one is the worst thing this screen can do.
        if (!cancelled) setState({ invoices: [], live: true });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (!CONFIGURED) return { invoices: seeded, loaded: true, live: false, refresh };

  if (!state) return { invoices: [], loaded: false, live: false, refresh };
  if (!state.live) return { invoices: seeded, loaded: true, live: false, refresh };
  return { invoices: state.invoices, loaded: true, live: true, refresh };
}
