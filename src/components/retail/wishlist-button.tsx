"use client";

import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWishlistStore } from "@/lib/stores/wishlist-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";

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
  const isSavedRaw = useWishlistStore((s) => s.isSaved(productId));
  const isSaved = mounted && isSavedRaw;
  const toggle = useWishlistStore((s) => s.toggle);

  return (
    <button
      type="button"
      aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={isSaved}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
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
