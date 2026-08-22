import { RETAIL_PRODUCTS } from "@/lib/mock/retail-products";
import type { FitVote } from "@/lib/fit";

// Seeded fit feedback, so the product page has something to show before real
// buyers have voted.
//
// Placeholder data, like the reviews in retail-reviews.ts and the photography.
// It is deliberately NOT in supabase/seed.sql: the seed carries the catalogue
// only, and loading invented buyer opinions into a real database would put
// fabricated social proof in front of whoever opens the site first, with no
// honest way to mark a row as "not a real customer" once it is in the table.
//
// Derived from each product's slug rather than hand-written, so adding a
// product does not mean remembering to add votes, and so the distribution
// varies by product instead of every page reading the same.

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function votesForSlug(slug: string): FitVote[] {
  const seed = hash(slug);
  const total = 6 + (seed % 20); // 6-25 votes, always above the reporting floor

  // Most garments are true to size; the lean decides which way the rest go, so
  // roughly a third of the catalogue reads as running small or large.
  const lean: FitVote = seed % 3 === 0 ? "small" : seed % 3 === 1 ? "large" : "true";

  const votes: FitVote[] = [];
  for (let i = 0; i < total; i += 1) {
    const roll = (seed + i * 17) % 10;
    if (roll < 6) votes.push("true");
    else if (roll < 8) votes.push(lean);
    else votes.push(lean === "small" ? "large" : "small");
  }
  return votes;
}

export const SEEDED_FIT_VOTES: Record<string, FitVote[]> = Object.fromEntries(
  RETAIL_PRODUCTS.map((product) => [product.id, votesForSlug(product.slug)])
);
