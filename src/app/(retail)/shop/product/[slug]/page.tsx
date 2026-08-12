import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AddToCartPanel } from "@/components/retail/add-to-cart-panel";
import { RETAIL_PRODUCTS, getRetailProductBySlug } from "@/lib/mock/retail-products";
import { formatPrice } from "@/lib/utils";

export function generateStaticParams() {
  return RETAIL_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getRetailProductBySlug(slug);
  if (!product) notFound();

  const discount = Math.round(((product.mrp - product.price) / product.mrp) * 100);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <div className="aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
        </div>

        <div>
          <p className="text-sm font-semibold text-neutral-500">{product.brand}</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-900">{product.name}</h1>

          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1 rounded bg-green-700 px-1.5 py-0.5 text-xs font-semibold text-white">
              {product.rating} <Star className="h-3 w-3 fill-white" />
            </span>
            <span className="text-neutral-500">{product.ratingCount} ratings</span>
            {product.tags?.map((tag) => (
              <Badge key={tag} variant="retail" className="capitalize">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-2xl font-bold text-neutral-900">{formatPrice(product.price)}</span>
            {discount > 0 && (
              <>
                <span className="text-neutral-400 line-through">{formatPrice(product.mrp)}</span>
                <span className="font-medium text-green-700">{discount}% off</span>
              </>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-neutral-600">{product.description}</p>

          <div className="mt-6 border-t border-neutral-200 pt-6">
            <AddToCartPanel product={product} />
          </div>
        </div>
      </div>
    </div>
  );
}
