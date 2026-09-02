// ---------------------------------------------------------------------------
// Stored wishlist rows, as the slugs the store holds.
//
// Three lines of mapping, separated out because of what happens when it is
// wrong rather than because of what it does. Its answer is handed to
// `adopt()`, which REPLACES the customer's local wishlist — so a mapping that
// silently returns nothing does not degrade to "we could not read it", it
// degrades to "you have saved nothing", and the hearts on screen go out.
//
// The read itself cannot go wrong quietly: a failed request is an error and
// `syncWishlist` returns `live: false` for it, which the caller ignores. What
// can go wrong quietly is the shape — an embed key renamed, a select edited to
// fetch the id instead of the slug — and that is exactly what a pure function
// with a test around it catches.
// ---------------------------------------------------------------------------

/** One row of the wishlist read, with the product embedded. */
export interface StoredWishlistRow {
  retail_products: { slug: string } | null;
}

/**
 * The slugs of the products on a stored wishlist.
 *
 * A row whose embed came back empty is dropped rather than carried as a hole.
 * That means the product was deleted outright — `wishlists.product_id`
 * cascades on delete, so it should not be reachable — and one missing heart is
 * a great deal better than an `undefined` travelling into a store whose whole
 * contract is that it holds slugs.
 */
export function slugsFromRows(rows: StoredWishlistRow[]): string[] {
  return rows
    .map((row) => row.retail_products?.slug)
    .filter((slug): slug is string => Boolean(slug));
}
