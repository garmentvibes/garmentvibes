// ---------------------------------------------------------------------------
// What to do with a locally-held list when a customer turns out to be signed
// in.
//
// A pure decision, separated from the round trip that acts on it, because the
// interesting case is the one that is hard to reach by hand: two people
// sharing a browser. Everything else about a sync is plumbing.
//
// Shared by the cart and the wishlist. It lived in lib/cart/ while the cart
// was the only thing that synced, and moved here when the wishlist turned out
// to need the identical rule — identical because the rule is not about what is
// in the list. It is about whose device this is and whether it has reconciled
// before, and neither of those changes because the items have quantities.
//
// A copy in each would have been the alternative, and a copy is how the two
// stop agreeing: the next person to fix a sync bug fixes it once.
// ---------------------------------------------------------------------------

export type SyncPlan =
  /** Fold the local bag into the stored one, then adopt the result. */
  | "merge"
  /** Take the stored bag as it is, discarding whatever was local. */
  | "adopt";

export interface SyncInput {
  /** How many lines the local bag holds. */
  localCount: number;
  /** The customer this device last reconciled with, if any. */
  syncedFor: string | undefined;
  /** The customer who is signed in now. */
  customerKey: string;
}

/**
 * Whether a locally-assembled bag should be merged in or thrown away.
 *
 * Three cases, and the third is the one worth the file:
 *
 *   1. **Never synced on this device.** The bag was assembled signed-out, so
 *      it is this customer's own work and merging it in is the whole point of
 *      the feature — the customer who filled a bag before logging in expects
 *      to find it there afterwards.
 *
 *   2. **Synced before, same customer.** The bag is already a copy of the
 *      stored one, so there is nothing to contribute and merging would be
 *      actively wrong: a line deleted on another device still sits in this
 *      copy, and merging would put it back. This is why the marker exists.
 *
 *   3. **Synced before, different customer.** Somebody else used this browser.
 *      Their bag must not be folded into this customer's — that is one
 *      person's shopping appearing in another's basket, on the shared laptop
 *      and the shop-floor tablet that make it a realistic thing to happen
 *      rather than a hypothetical one. Adopt, and let the stored bag stand.
 *
 * Cases 2 and 3 reach the same answer by different routes, and an empty local
 * bag reaches it by a third, so the rule collapses to: merge exactly when
 * there is something local and this device has never reconciled. The three
 * cases are written out above because the rule is only obviously right once
 * you can see what each of them would otherwise do.
 *
 * `customerKey` is therefore unused in the arithmetic, and kept in the
 * signature on purpose: it is what case 3 turns on, and dropping it would make
 * the shared-browser case invisible to anyone changing this later.
 */
export function decideSync({ localCount, syncedFor }: SyncInput): SyncPlan {
  if (localCount === 0) return "adopt";
  return syncedFor === undefined ? "merge" : "adopt";
}
