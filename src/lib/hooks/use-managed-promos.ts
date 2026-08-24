"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createPromoCode,
  deletePromoCode,
  listPromoCodes,
  setPromoActive,
} from "@/lib/admin/promos/actions";
import { sortForAdmin } from "@/lib/admin/promos/rows";
import { parsePromoForm, type ManagedPromoCode, type PromoFormInput } from "@/lib/admin/promos/form";
import { usePromoStore } from "@/lib/stores/promo-store";
import { totalRedemptions } from "@/lib/promo-eligibility";

// ---------------------------------------------------------------------------
// The promo codes the admin panel manages.
//
// The panel has always edited `usePromoStore` — a zustand store in
// localStorage — so a code an admin created existed on one laptop, in one
// browser, and nowhere checkout could see it. 0009 said as much when it
// created the table:
//
//     a code created in the admin panel discounts the basket in the UI and is
//     then rejected at checkout
//
// This reads and writes the table instead, when there is one. The store stays
// as the whole implementation for deployments without a Supabase project,
// which is every environment the QA suites run in.
// ---------------------------------------------------------------------------

/**
 * Whether this deployment has a database to manage codes in.
 *
 * From the inlined public env rather than asked of the server, for the same
 * reason as `use-my-orders.ts` and `use-cart.ts`: the answer is fixed at build
 * time, and asking costs a round trip and a loading state on a page that is
 * going to fall back regardless. That loading state is not free — it cost two
 * e2e runs in three the last time one was introduced.
 */
const CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export interface ManagedPromos {
  codes: ManagedPromoCode[];
  /** True once the server has answered, or immediately when there is nobody to ask. */
  loaded: boolean;
  /** True when these are the stored codes rather than the local store's. */
  live: boolean;
  create: (input: PromoFormInput) => Promise<string | null>;
  setActive: (code: string, active: boolean) => Promise<string | null>;
  remove: (code: string) => Promise<string | null>;
}

export function useManagedPromos(): ManagedPromos {
  // Read unconditionally — hooks cannot be conditional, and this is also what
  // the fallback returns.
  const localCodes = usePromoStore((s) => s.codes);
  const localRedemptions = usePromoStore((s) => s.redemptions);
  const localAdd = usePromoStore((s) => s.add);
  const localToggle = usePromoStore((s) => s.toggle);
  const localRemove = usePromoStore((s) => s.remove);

  const [stored, setStored] = useState<ManagedPromoCode[] | null>(null);

  const reload = useCallback(async () => {
    if (!CONFIGURED) return;
    const result = await listPromoCodes();
    // Not cleared on a failed read — that would drop the panel back to the
    // local store and show an admin a set of codes checkout has never heard
    // of, which is the exact confusion this replaces.
    if (result.live) setStored(result.codes);
  }, []);

  // The first load is written out rather than calling reload(), so the state
  // update happens inside a promise callback with a cancellation flag around
  // it. Same shape as use-my-orders.ts, and the same reason: a component
  // unmounted mid-flight must not be written to.
  useEffect(() => {
    if (!CONFIGURED) return;

    let cancelled = false;

    listPromoCodes()
      .then((result) => {
        if (!cancelled && result.live) setStored(result.codes);
      })
      .catch(() => {
        // Leaves `stored` null, so the panel keeps showing the local store
        // and the next navigation tries again.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const live = CONFIGURED && stored !== null;

  // The local store carries no usage counts of its own shape, so they are
  // derived from its redemption map — the same numbers the panel printed
  // before, arriving through the same interface as the stored ones.
  const fallback: ManagedPromoCode[] = sortForAdmin(
    localCodes.map((code) => ({
      ...code,
      redemptions: totalRedemptions(localRedemptions, code.code),
      // The local map counts per customer but the panel never showed the
      // distinct total, so there is nothing to derive it from that would not
      // be an invention. Zero, and the column simply says less on a
      // deployment with no database.
      customers: 0,
    }))
  );

  const create = useCallback(
    async (input: PromoFormInput): Promise<string | null> => {
      // Parsed here as well as in the action, so the admin gets the error
      // without a round trip. The action's copy is the one that binds.
      const parsed = parsePromoForm(input, Date.now());
      if (!parsed.ok) return parsed.error;

      if (CONFIGURED) {
        const result = await createPromoCode(input);
        if (result.error) return result.error;
        if (!result.notConfigured) {
          await reload();
          return null;
        }
      }

      localAdd({ ...parsed.value, active: true });
      return null;
    },
    [localAdd, reload]
  );

  const setActive = useCallback(
    async (code: string, active: boolean): Promise<string | null> => {
      if (CONFIGURED) {
        const result = await setPromoActive(code, active);
        if (result.error) return result.error;
        if (!result.notConfigured) {
          await reload();
          return null;
        }
      }

      localToggle(code);
      return null;
    },
    [localToggle, reload]
  );

  const remove = useCallback(
    async (code: string): Promise<string | null> => {
      if (CONFIGURED) {
        const result = await deletePromoCode(code);
        if (result.error) return result.error;
        if (!result.notConfigured) {
          await reload();
          return null;
        }
      }

      localRemove(code);
      return null;
    },
    [localRemove, reload]
  );

  return {
    codes: live ? stored : fallback,
    loaded: !CONFIGURED || stored !== null,
    live,
    create,
    setActive,
    remove,
  };
}
