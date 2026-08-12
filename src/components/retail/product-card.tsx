import Link from "next/link";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import type { RetailProduct } from "@/types/catalog";

export function ProductCard({ product }: { product: RetailProduct }) {
  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);

  return (
    <Link href={`/shop/product/${product.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images[0]}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.tags?.includes("bestseller") && (
          <Badge variant="retail" className="absolute left-2 top-2">
            Bestseller
          </Badge>
        )}
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
