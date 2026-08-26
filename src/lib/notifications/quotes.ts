import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { trackingUrlFor } from "@/lib/couriers";
import { formatPrice } from "@/lib/utils";
import { enqueueNotification } from "./enqueue";
import type { NotificationTemplateId } from "@/types/notifications";

// ---------------------------------------------------------------------------
// Telling a wholesale buyer where their quote or consignment has got to.
//
// The wholesale counterpart of ./orders.ts. Two transitions are worth a
// message, and both are ones the buyer has to act on rather than merely note:
//
//   * `quoted` — the price is ready and they have to decide. Until they see it,
//     nothing moves, so this is the one holding the whole thing up.
//   * `shipped` — a consignment is coming, and 0007 gives them 7 days from
//     delivery to raise a short shipment or transit damage. They need to know
//     to check it against the packing list when it arrives.
//
// `confirmed` and `in_production` are ours, not theirs: a business does not
// need an email saying we have started making the thing they ordered.
// ---------------------------------------------------------------------------

const STATUS_TEMPLATES: Partial<Record<string, NotificationTemplateId>> = {
  quoted: "quote_ready",
  shipped: "bulk_order_shipped",
};

/**
 * What the read below returns.
 *
 * Spelled out because the client is untyped and a nested embed defeats its
 * inference entirely — without this, every field reads as an error type and
 * the compiler has nothing useful to say about a typo in a column name.
 */
interface QuoteNotificationRow {
  reference: string | null;
  status: string;
  business_name: string | null;
  contact_name: string | null;
  email: string | null;
  courier_id: string | null;
  awb: string | null;
  wholesale_quote_items: Array<{ qty: number; price_per_unit: number }> | null;
}

/**
 * Queues the buyer's message for a quote's current status, if that status is
 * one they are waiting on.
 *
 * Reads the row rather than taking the status as an argument, so a refused
 * update announces nothing — the same reasoning as notifyOrderStatus.
 *
 * The total is summed from the lines rather than read from `grand_total`,
 * because a quote that has not been priced yet has a grand total of zero: 0004
 * defaults those columns to 0 and only the invoice path fills them. Quoting
 * "₹0" at a business waiting for a price is worse than not writing.
 */
export async function notifyQuoteStatus(quoteId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from("wholesale_quotes")
      .select(
        "reference, status, business_name, contact_name, email, courier_id, awb, " +
          "wholesale_quote_items ( qty, price_per_unit )"
      )
      .eq("id", quoteId)
      .maybeSingle();

    if (error) {
      console.error("[notifications] could not read quote to notify", {
        quoteId,
        message: error.message,
      });
      return;
    }

    const quote = data as unknown as QuoteNotificationRow | null;
    if (!quote) return;

    const template = STATUS_TEMPLATES[quote.status];
    if (!template) return;

    const total = (quote.wholesale_quote_items ?? []).reduce(
      (sum, line) => sum + line.qty * line.price_per_unit,
      0
    );

    await enqueueNotification(
      template,
      {
        name: quote.contact_name ?? "",
        orderId: quote.reference ?? undefined,
        amount: formatPrice(total),
        businessName: quote.business_name ?? undefined,
        trackingUrl: trackingUrlFor(quote.courier_id ?? undefined, quote.awb ?? undefined) || undefined,
      },
      {
        name: quote.contact_name ?? "",
        email: quote.email,
        // No phone deliberately. `wholesale_quotes` has no phone column — the
        // number lives on the account, not the request — and inventing a
        // lookup here to reach a channel these templates barely use would be
        // more machinery than the message is worth.
      },
      {
        relatedTo: quote.reference ?? undefined,
        dedupeScope: `${quoteId}:${quote.status}`,
      }
    );
  } catch (error) {
    console.error("[notifications] quote status notification threw", { quoteId, error });
  }
}
