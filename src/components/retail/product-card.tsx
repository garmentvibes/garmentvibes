import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WishlistButton } from "@/components/retail/wishlist-button";
import { formatPrice } from "@/lib/utils";
import type { RetailProduct } from "@/types/catalog";

export function ProductCard({ product }: { product: RetailProduct }) {
  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);

  return (
    <Link href={`/shop/product/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100">
        <Image
          src={product.images[0]}
          alt={product.name}
          fill
          // Matches the grid this card sits in: two across on a phone, three
          // from sm, four from md. Without it the browser assumes each image
          // is viewport-wide and downloads roughly four times the pixels it
          // needs on a phone.
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.tags?.includes("bestseller") && (
          <Badge variant="retail" className="absolute left-2 top-2">
            Bestseller
          </Badge>
        )}
        <WishlistButton productId={product.id} size="sm" className="absolute right-2 top-2" />
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="text-xs font-semibold text-neutral-500">{product.brand}</p>
        <p className="truncate text-sm text-neutral-800">{product.name}</p>
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-neutral-900">{formatPrice(product.price)}</span>
          {discount > 0 && (
            <>
              <span className="text-neutral-400 line-through">{formatPrice(product.mrp)}</span>
              <span className="text-green-700">{discount}% off</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-neutral-500">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          {product.rating} <span className="text-neutral-400">({product.ratingCount})</span>
        </div>
      </div>
    </Link>
  );
}
