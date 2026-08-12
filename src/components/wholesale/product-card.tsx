import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import type { WholesaleProduct } from "@/types/catalog";

export function WholesaleProductCard({ product }: { product: WholesaleProduct }) {
  const bestTier = product.priceTiers[product.priceTiers.length - 1];

  return (
    <Link
      href={`/wholesale/product/${product.slug}`}
      className="group block overflow-hidden rounded-lg border border-slate-200 bg-white transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.images[0]}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {product.tags?.includes("bestseller") && (
          <Badge variant="wholesale" className="absolute left-2 top-2">
            Bestseller
          </Badge>
        )}
      </div>
      <div className="space-y-1 p-3">
        <p className="text-xs font-mono text-slate-400">{product.sku}</p>
        <p className="truncate text-sm font-medium text-slate-800">{product.name}</p>
        <p className="text-xs text-slate-500">MOQ {product.moq} units</p>
        <div className="flex items-baseline gap-1 text-sm">
          <span className="font-semibold text-slate-900">from {formatPrice(bestTier.pricePerUnit)}</span>
          <span className="text-xs text-slate-400">/ unit</span>
        </div>
      </div>
    </Link>
  );
}
