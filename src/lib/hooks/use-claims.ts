"use client";

import { useCallback, useEffect, useState } from "react";
import { allClaims, myClaims } from "@/lib/claims/reads";
import { useClaimsStore } from "@/lib/stores/claims-store";
import type { WholesaleClaim } from "@/types/claims";

// ---------------------------------------------------------------------------
// Wholesale claims, from the database when there is one.
//
// Same three-state shape as use-returns.ts, and the same reason for the
// fallback: every QA suite here runs with no Supabase project.
// ---------------------------------------------------------------------------

export interface Claims {
  claims: WholesaleClaim[];
  loaded: boolean;
  live: boolean;
  refresh: () => void;
}

const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function useClaimsFrom(read: () => Promise<{ claims: WholesaleClaim[]; live: boolean }>): Claims {
  const seeded = useClaimsStore((s) => s.claims);

  const [state, setState] = useState<{ claims: WholesaleClaim[]; live: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    read()
      .then((result) => {
        if (!cancelled) setState({ claims: result.claims, live: result.live });
      })
      .catch(() => {
        // Live-empty rather than the seed: invented claims in front of
        // somebody about to raise a credit note is money moving against a
        // dispute that does not exist.
        if (!cancelled) setState({ claims: [], live: true });
      });

    return () => {
      cancelled = true;
    };
    // `read` is a module-level server action reference and stable; nonce is
    // what re-runs this after a write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (!CONFIGURED) return { claims: seeded, loaded: true, live: false, refresh };

  if (!state) return { claims: [], loaded: false, live: false, refresh };
  if (!state.live) return { claims: seeded, loaded: true, live: false, refresh };
  return { claims: state.claims, loaded: true, live: true, refresh };
}

/** The whole claims queue. Staff only — a buyer gets `live: false`. */
export function useAllClaims(): Claims {
  return useClaimsFrom(allClaims);
}

/** The signed-in buyer's own claims. */
export function useMyClaims(): Claims {
  return useClaimsFrom(myClaims);
}
