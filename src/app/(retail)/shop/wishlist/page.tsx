"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/retail/product-card";
import { useWishlistStore } from "@/lib/stores/wishlist-store";
import { useCatalogue } from "@/components/shared/catalogue-provider";

export default function WishlistPage() {
  const productIds = useWishlistStore((s) => s.productIds);
  const catalogue = useCatalogue();
  const products = catalogue.filter((p) => productIds.includes(p.id));

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <Heart className="mx-auto h-10 w-10 text-neutral-300" />
        <h1 className="mt-4 text-xl font-bold text-neutral-900">Your wishlist is empty</h1>
        <p className="mt-2 text-neutral-500">Tap the heart on any product to save it here.</p>
        <Link href="/shop">
          <Button variant="retail" className="mt-6">
            Continue Shopping
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-neutral-900">My Wishlist ({products.length})</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
