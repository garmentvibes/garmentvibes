"use client";

import { useCallback, useEffect, useState } from "react";
import { allWholesaleQuotes } from "@/lib/admin/quotes/reads";
import { useWholesaleQuotes as useSeededQuotes } from "@/lib/stores/admin-orders-store";
import type { WholesaleQuote } from "@/types/admin";

// ---------------------------------------------------------------------------
// The quotes and bulk orders staff have to fulfil.
//
// The wholesale mirror of use-admin-orders.ts, with the same fallback rule and
// the same reason for it: every QA suite in this repo runs with no Supabase
// project, and the seed is what those exercise.
// ---------------------------------------------------------------------------

export interface AdminQuotes {
  quotes: WholesaleQuote[];
  loaded: boolean;
  live: boolean;
  /** Re-reads after a write, which `revalidatePath` cannot do for this state. */
  refresh: () => void;
}

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export function useAdminQuotes(): AdminQuotes {
  const seeded = useSeededQuotes();

  const [state, setState] = useState<{ quotes: WholesaleQuote[]; live: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    allWholesaleQuotes()
      .then((result) => {
        if (!cancelled) setState({ quotes: result.quotes, live: result.live });
      })
      .catch(() => {
        // Live-empty rather than the seed: fictional quotes in front of
        // somebody about to price or ship one is the worse failure.
        if (!cancelled) setState({ quotes: [], live: true });
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (!CONFIGURED) return { quotes: seeded, loaded: true, live: false, refresh };

  if (!state) return { quotes: [], loaded: false, live: false, refresh };
  if (!state.live) return { quotes: seeded, loaded: true, live: false, refresh };
  return { quotes: state.quotes, loaded: true, live: true, refresh };
}

/** One quote by its reference, from the same fetch as the list. */
export function useAdminQuote(reference: string): {
  quote: WholesaleQuote | undefined;
  loaded: boolean;
  live: boolean;
  refresh: () => void;
} {
  const { quotes, loaded, live, refresh } = useAdminQuotes();
  return { quote: quotes.find((q) => q.id === reference), loaded, live, refresh };
}
