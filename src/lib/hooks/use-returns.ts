"use client";

import { useCallback, useEffect, useState } from "react";
import { allReturns, myReturns } from "@/lib/returns/reads";
import { useReturnsStore } from "@/lib/stores/returns-store";
import type { ReturnRequest } from "@/types/returns";

// ---------------------------------------------------------------------------
// Return requests, from the database when there is one.
//
// One hook with two audiences, because the fallback and the loading rules are
// identical and only the read differs: staff see the whole queue, a customer
// sees their own. Splitting them into two hooks would be two copies of the
// same three-state decision.
// ---------------------------------------------------------------------------

export interface Returns {
  requests: ReturnRequest[];
  loaded: boolean;
  live: boolean;
  refresh: () => void;
}

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function useReturnsFrom(read: () => Promise<{ requests: ReturnRequest[]; live: boolean }>): Returns {
  const seeded = useReturnsStore((s) => s.requests);

  const [state, setState] = useState<{ requests: ReturnRequest[]; live: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    read()
      .then((result) => {
        if (!cancelled) setState({ requests: result.requests, live: result.live });
      })
      .catch(() => {
        // Live-empty rather than the seed: invented returns in front of
        // somebody about to approve a refund is the failure to avoid.
        if (!cancelled) setState({ requests: [], live: true });
      });

    return () => {
      cancelled = true;
    };
    // `read` is a module-level server action reference and stable; nonce is
    // what re-runs this after a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (!CONFIGURED) return { requests: seeded, loaded: true, live: false, refresh };

  if (!state) return { requests: [], loaded: false, live: false, refresh };
  if (!state.live) return { requests: seeded, loaded: true, live: false, refresh };
  return { requests: state.requests, loaded: true, live: true, refresh };
}

/** The whole returns queue. Staff only — a customer gets `live: false`. */
export function useAllReturns(): Returns {
  return useReturnsFrom(allReturns);
}

/** The signed-in customer's own returns. */
export function useMyReturns(): Returns {
  return useReturnsFrom(myReturns);
}
