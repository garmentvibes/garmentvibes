export interface RetailReview {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  body: string;
  /**
   * True when the reviewer received this product. Derived from the order
   * history at submission time, not asserted by the reviewer.
   */
  verified: boolean;
  /**
   * Customer photos, as data URLs while reviews live in localStorage. Becomes
   * Supabase Storage URLs when reviews move to the database — the field does
   * not change shape.
   */
  photos?: string[];
}

const REVIEW_POOL: Omit<RetailReview, "id">[] = [
  {
    author: "Priya S.",
    rating: 5,
    date: "2026-07-18",
    title: "Loved it!",
    body: "Fabric quality is great and the fit is exactly as shown. Would buy again.",
    verified: true,
  },
  {
    author: "Ankit R.",
    rating: 4,
    date: "2026-07-02",
    title: "Good value",
    body: "Nice product for the price, delivery was quick. Slightly loose fit for me.",
    verified: true,
  },
  {
    author: "Meera K.",
    rating: 5,
    date: "2026-06-21",
    title: "Exceeded expectations",
    body: "Color is richer in person than in photos. Packaging was neat too.",
    verified: false,
  },
  {
    author: "Rohan D.",
    rating: 3,
    date: "2026-06-05",
    title: "Decent, runs small",
    body: "Would recommend sizing up. Otherwise the material feels durable.",
    verified: true,
  },
];

// Deterministic mock reviews per product so SSR/CSR render identically.
export function getRetailReviews(productId: string): RetailReview[] {
  const seed = productId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const count = 2 + (seed % 3);
  return Array.from({ length: count }, (_, i) => ({
    id: `${productId}-review-${i}`,
    ...REVIEW_POOL[(seed + i) % REVIEW_POOL.length],
  }));
}
