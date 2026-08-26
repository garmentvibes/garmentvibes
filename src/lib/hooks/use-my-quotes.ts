"use client";

import { useEffect, useState } from "react";
import { myWholesaleQuotes } from "@/lib/wholesale/reads";
import { useWholesaleQuotes as useSeededQuotes } from "@/lib/stores/admin-orders-store";
import type { WholesaleQuote } from "@/types/admin";

// ---------------------------------------------------------------------------
// The buyer's own quotes and bulk orders.
//
// Same shape and same fallback rule as use-my-orders.ts. Read through one hook
// rather than per page so that "which source am I looking at" is answered once
// — the dashboard and the claim form both need it, and two answers is two
// chances to show a business somebody else's demo consignment.
// ---------------------------------------------------------------------------

export interface MyQuotes {
  quotes: WholesaleQuote[];
  loaded: boolean;
  live: boolean;
}

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function useMyQuotes(): MyQuotes {
  const seeded = useSeededQuotes();

  const [state, setState] = useState<{ quotes: WholesaleQuote[]; live: boolean } | null>(null);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    myWholesaleQuotes()
      .then((result) => {
        if (!cancelled) setState({ quotes: result.quotes, live: result.live });
      })
      .catch(() => {
        // Live-empty rather than the seed: a network blip must not put another
        // business's fictional orders in front of a real buyer.
        if (!cancelled) setState({ quotes: [], live: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!CONFIGURED) return { quotes: seeded, loaded: true, live: false };

  if (!state) return { quotes: [], loaded: false, live: false };
  if (!state.live) return { quotes: seeded, loaded: true, live: false };
  return { quotes: state.quotes, loaded: true, live: true };
}

/** One of the buyer's quotes by reference, from the same fetch as the list. */
export function useMyQuote(reference: string): {
  quote: WholesaleQuote | undefined;
  loaded: boolean;
  live: boolean;
} {
  const { quotes, loaded, live } = useMyQuotes();
  return { quote: quotes.find((q) => q.id === reference), loaded, live };
}
