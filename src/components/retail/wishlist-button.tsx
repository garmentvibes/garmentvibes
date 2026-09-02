"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/lib/hooks/use-wishlist";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { track } from "@/lib/analytics";

export function WishlistButton({
  productId,
  className,
  size = "md",
}: {
  productId: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const mounted = useHasMounted();
  // Through the hook rather than the store, so a signed-in customer's hearts
  // are written to `wishlists` as well as to localStorage. `mounted` still
  // gates the rendered state: the store is rehydrated after mount, so reading
  // it during the first client render would disagree with the server's HTML.
  const { isSaved: isSavedIn, toggle } = useWishlist();
  const isSaved = mounted && isSavedIn(productId);

  return (
    <button
      type="button"
      aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={isSaved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isSaved) track({ name: "wishlist_add", productId });
        toggle(productId);
      }}
      className={cn(
        "flex items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        className
      )}
    >
      <Heart
        className={cn(size === "sm" ? "h-4 w-4" : "h-5 w-5", isSaved && "fill-rose-600 text-rose-600")}
      />
    </button>
  );
}
