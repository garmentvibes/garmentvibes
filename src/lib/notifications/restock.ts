import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueNotification } from "./enqueue";

// ---------------------------------------------------------------------------
// Telling people a variant is back.
//
// The counterpart to ./dispatch.ts, one step earlier in the pipeline: that
// file sends what is in the outbox, this one decides what goes into it.
//
// ---------------------------------------------------------------------------
// Why it asks rather than being told
// ---------------------------------------------------------------------------
//
// The obvious design notifies from wherever stock goes up. There are two such
// places today — `adjust_retail_stock` behind a return coming back, and the
// plain update behind an admin setting a level — and the number is not stable.
// Wiring the notification to those call sites means the restocks that notify
// are the restocks somebody remembered to wire.
//
// `claim_stock_alerts` asks the question instead: which pending registrations
// name a variant that has stock right now. That has the same answer however
// the stock arrived, so a restock through a path nobody has written yet still
// reaches the people waiting on it. See the header of 0029.
//
// ---------------------------------------------------------------------------
// Why service role
// ---------------------------------------------------------------------------
//
// Claiming takes a registration off the queue, and a mistake there is a
// customer who is never told — so 0029 grants it to `service_role` alone, as
// 0020 does for the outbox. Not even staff can claim by hand.
// ---------------------------------------------------------------------------

/** What one pass over the pending registrations did. */
export interface RestockSummary {
  /** How many registrations were claimed. */
  claimed: number;
  /** How many turned into queued messages. */
  queued: number;
  /** Why nothing ran, when nothing ran. */
  skipped?: "no-service-role";
}

/** One claimed row, joined to the product it names. */
interface ClaimedAlert {
  id: string;
  product_id: string;
  size_label: string;
  email: string;
  name: string;
}

/**
 * How many registrations one pass handles.
 *
 * Larger than the notification dispatch batch because the work per row is a
 * database write rather than an HTTP call: this queues messages, it does not
 * send them. The sending is the outbox's job and has its own, smaller, batch.
 */
const BATCH = 100;

/**
 * Queues a back-in-stock message for everyone waiting on a variant that now
 * has stock.
 *
 * Never throws. Every caller is finishing something that already succeeded — a
 * return approved, a stock level corrected — and none of those may fail
 * because a notification could not be queued.
 *
 * Safe to call as often as you like. The claim stamps what it takes, so a
 * second pass a moment later finds nothing and nobody is emailed twice; that
 * is what lets this run both from the stock write and from the daily sweep.
 */
export async function notifyRestocked(limit = BATCH): Promise<RestockSummary> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return { claimed: 0, queued: 0, skipped: "no-service-role" };

    const { data, error } = await supabase.rpc("claim_stock_alerts", { p_limit: limit });

    if (error) {
      console.error("[stock-alerts] could not claim registrations", error.message);
      return { claimed: 0, queued: 0 };
    }

    const claimed = (data ?? []) as unknown as ClaimedAlert[];
    if (claimed.length === 0) return { claimed: 0, queued: 0 };

    // One read for the names, rather than one per registration. A restock of a
    // popular size can claim a hundred rows naming a handful of products, and
    // the alternative is a hundred round trips to learn the same few names.
    const productIds = [...new Set(claimed.map((a) => a.product_id))];
    const { data: products, error: productsError } = await supabase
      .from("retail_products")
      .select("id, name")
      .in("id", productIds);

    if (productsError) {
      // The registrations are already stamped, so this pass cannot be retried
      // for them — which is why it is logged loudly rather than swallowed.
      console.error("[stock-alerts] claimed registrations but could not name the products", {
        claimed: claimed.length,
        message: productsError.message,
      });
      return { claimed: claimed.length, queued: 0 };
    }

    const names = new Map((products ?? []).map((p) => [p.id, p.name]));

    let queued = 0;

    for (const alert of claimed) {
      const written = await enqueueNotification(
        "back_in_stock",
        {
          name: alert.name,
          productName: names.get(alert.product_id) ?? "An item you saved",
          replacementSize: alert.size_label,
        },
        { name: alert.name, email: alert.email },
        {
          // The registration's own id. Two passes cannot both claim it — the
          // claim is what stops that — but the dedupe key costs nothing and
          // means a bug that did claim twice still only queues one message.
          dedupeScope: alert.id,
        }
      );

      queued += written;
    }

    return { claimed: claimed.length, queued };
  } catch (error) {
    console.error("[stock-alerts] restock notification threw", error);
    return { claimed: 0, queued: 0 };
  }
}
