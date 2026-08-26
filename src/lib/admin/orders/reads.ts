"use server";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getStaffUser } from "@/lib/auth/dal";
import { ORDER_SELECT, toRetailOrder, type OrderRow } from "@/lib/orders/rows";
import type { RetailOrder } from "@/types/admin";

// ---------------------------------------------------------------------------
// Every order, for the people who have to fulfil them.
//
// The admin panel rendered `SEED_RETAIL_ORDERS` — six fictional orders in
// src/lib/mock/admin-data.ts — with status changes layered on top from
// localStorage. Nothing ever put a placed order into that array.
//
// So on a deployment with a database, a customer could check out, be charged,
// have the row land in `retail_orders` and get a confirmation queued, and then
// staff would open the panel and see six invented orders and none of the real
// one. There was no way to mark it packed, attach an AWB, or ship it. The order
// existed and was invisible to the only people who could act on it.
//
// ---------------------------------------------------------------------------
// No ownership filter, on purpose
// ---------------------------------------------------------------------------
//
// The staff policy from 0004 is `for all using (is_staff())`, so this query
// returns every order to staff and nothing at all to anyone else. There is
// deliberately no `.eq()` here doing the same job: a filter in the query would
// look like the protection while being decoration on top of it, and the day
// somebody edited it out, nothing would appear to change. The protection is the
// policy. `getStaffUser()` below is the second door, not the first.
// ---------------------------------------------------------------------------

export interface AdminOrderRead {
  orders: RetailOrder[];
  /**
   * False when there was nothing to read from — no Supabase project, or the
   * caller is not staff. The panel falls back to the demo seed, which is what
   * every QA suite here runs against.
   *
   * Distinct from `live: true` with an empty list, which means a real shop that
   * genuinely has no orders yet. Those two have to render differently, or a
   * quiet Tuesday looks like a broken deployment.
   */
  live: boolean;
}

/** Every retail order, newest first. */
export async function allRetailOrders(): Promise<AdminOrderRead> {
  if (!supabaseConfigured()) return { orders: [], live: false };

  const staff = await getStaffUser();
  if (!staff) return { orders: [], live: false };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("retail_orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/orders] could not read orders", error.message);
    // Not `live: false`. This deployment does have a database and the caller is
    // staff — falling back to the seed here would put fictional orders in front
    // of somebody about to act on them, and "ship order GV-1003" against an
    // order that does not exist is worse than an empty page.
    return { orders: [], live: true };
  }

  return {
    orders: (data as unknown as OrderRow[]).map(toRetailOrder),
    live: true,
  };
}
