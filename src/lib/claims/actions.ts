"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/auth/demo";
import { getCustomer } from "@/lib/auth/customer";
import { getStaffUser } from "@/lib/auth/dal";
import { claimReasonToCode } from "./rows";
import { CLAIM_STATUSES, type ClaimStatus, type WholesaleClaim } from "@/types/claims";
import type { Database } from "@/types/database";

// ---------------------------------------------------------------------------
// Raising a claim, and settling one.
//
// 0007 gates the buyer's insert on three things at once — the status is
// `submitted`, the account is approved, and the account is theirs — so an
// unapproved business cannot file against somebody else's consignment, and no
// buyer can file a claim that arrives already granted.
//
// `account_id` is therefore sent explicitly rather than left to a default:
// `wholesale_account_id()` resolves it from the caller's own session, so the
// value it must equal is the one the caller could not have chosen.
// ---------------------------------------------------------------------------

export interface ClaimWriteResult {
  error: string | null;
  /** The stored reference, so the buyer can be shown their CLM code. */
  reference?: string;
  /** True when there was no database; the caller keeps its local store. */
  notConfigured?: boolean;
}

function republish() {
  revalidatePath("/admin/claims");
  revalidatePath("/admin");
  revalidatePath("/wholesale/orders");
  revalidatePath("/wholesale/dashboard");
}

/**
 * Raises a claim against one of the buyer's own consignments.
 *
 * The line quantities carry the constraint that matters, and it is in the
 * database rather than here: `claimed_qty <= billed_qty` is what stops a typo
 * becoming a credit note worth more than the invoice. This validates the
 * obvious cases so a buyer gets a sentence rather than a constraint name.
 */
export async function createClaim(
  input: Omit<WholesaleClaim, "id" | "status" | "createdAt">
): Promise<ClaimWriteResult> {
  if (!supabaseConfigured()) return { error: null, notConfigured: true };

  const customer = await getCustomer();
  if (!customer) return { error: "Please sign in to raise a claim" };

  if (input.lines.length === 0) {
    return { error: "Add at least one line to the claim" };
  }

  const overclaimed = input.lines.find((l) => l.claimedQty > l.billedQty || l.claimedQty < 1);
  if (overclaimed) {
    return {
      error: `You can claim between 1 and ${overclaimed.billedQty} units of ${overclaimed.sku}`,
    };
  }

  const supabase = await createClient();

  // The consignment is addressed by reference; the lookup is RLS-scoped, so
  // another business's order simply is not found.
  const { data: quote } = await supabase
    .from("wholesale_quotes")
    .select("id, account_id")
    .eq("reference", input.orderId)
    .maybeSingle();

  if (!quote) return { error: "We could not find that order" };

  const reference = `CLM${Date.now().toString(36).toUpperCase()}`;

  const { data: created, error } = await supabase
    .from("wholesale_claims")
    .insert({
      reference,
      quote_id: quote.id,
      // Must equal wholesale_account_id() or the policy refuses the row. Taken
      // from the consignment rather than from the request for the same reason
      // the policy checks it: it is not the caller's to name.
      account_id: quote.account_id,
      business_name: input.businessName,
      contact_name: input.contactName,
      email: input.email,
      reason: claimReasonToCode(input.reason),
      requested_resolution: input.requestedResolution,
      comments: input.comments ?? null,
    })
    .select("id, reference")
    .single();

  if (error) {
    console.error("[claims] could not raise the claim", {
      orderId: input.orderId,
      message: error.message,
    });
    return { error: "We could not raise that claim. Please try again." };
  }

  const { error: linesError } = await supabase.from("wholesale_claim_lines").insert(
    input.lines.map((line) => ({
      claim_id: created.id,
      sku: line.sku,
      product_name: line.name,
      billed_qty: line.billedQty,
      claimed_qty: line.claimedQty,
      price_per_unit: line.pricePerUnit,
    }))
  );

  if (linesError) {
    console.error("[claims] could not save the claim's lines", {
      reference,
      message: linesError.message,
    });
    // A claim with no lines is a dispute with no amount. Removing it is the
    // honest cleanup — the lines cascade, so nothing is orphaned.
    await supabase.from("wholesale_claims").delete().eq("id", created.id);
    return { error: "We could not raise that claim. Please try again." };
  }

  republish();

  return { error: null, reference: created.reference ?? reference };
}

/**
 * Moves a claim through the queue. Staff only.
 *
 * Settling needs more than a status: 0007 refuses a `settled` row that records
 * neither what was granted nor when, because a settled claim nobody can audit
 * is a credit note with no paper behind it. So `settled` stamps both, and the
 * granted resolution defaults to what the buyer asked for when staff have not
 * said otherwise.
 */
export async function setClaimStatus(
  reference: string,
  status: ClaimStatus,
  decisionNote?: string
): Promise<ClaimWriteResult> {
  if (!supabaseConfigured()) return { error: null, notConfigured: true };

  const staff = await getStaffUser();
  if (!staff) return { error: "Only staff can decide claims" };

  if (!CLAIM_STATUSES.includes(status)) {
    return { error: `${status} is not a claim status` };
  }

  const supabase = await createClient();

  const { data: claim } = await supabase
    .from("wholesale_claims")
    .select("id, requested_resolution, settled_resolution")
    .eq("reference", reference)
    .maybeSingle();

  if (!claim) return { error: "No such claim" };

  const patch: Database["public"]["Tables"]["wholesale_claims"]["Update"] = { status };
  if (decisionNote !== undefined) patch.decision_note = decisionNote || null;

  if (status === "settled") {
    patch.settled_at = new Date().toISOString();
    patch.settled_resolution = claim.settled_resolution ?? claim.requested_resolution;
  }

  const { error } = await supabase
    .from("wholesale_claims")
    .update(patch)
    .eq("reference", reference);

  if (error) {
    console.error("[claims] could not set the status", {
      reference,
      status,
      message: error.message,
    });
    return { error: "Could not update that claim" };
  }

  republish();

  return { error: null, reference };
}
