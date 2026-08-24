"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SizeGuideModal } from "@/components/retail/size-guide-modal";
import { DeliveryEstimator } from "@/components/retail/delivery-estimator";
import { BackInStockNotify } from "@/components/retail/back-in-stock-notify";
import { cn, formatPrice } from "@/lib/utils";
import { useCart } from "@/lib/hooks/use-cart";
import { useStockStore, getStock, LOW_STOCK_THRESHOLD } from "@/lib/stores/stock-store";
import { track } from "@/lib/analytics";
import { useKeptSizes } from "@/lib/hooks/use-kept-sizes";
import { useFitFeedbackStore, votesFor } from "@/lib/stores/fit-feedback-store";
import { recommendSize, summariseFit } from "@/lib/fit";
import type { RetailProduct } from "@/types/catalog";

export function AddToCartPanel({ product }: { product: RetailProduct }) {
  const [size, setSize] = useState(product.sizes.find((s) => s.inStock)?.label ?? "");
  const [color, setColor] = useState(product.colors[0] ?? "");
  const { addLine } = useCart();
  const decrementStock = useStockStore((s) => s.decrement);
  const stockOverrides = useStockStore((s) => s.overrides);
  const router = useRouter();

  const keptSizes = useKeptSizes();
  const ownFitVotes = useFitFeedbackStore((s) => s.votes);
  const labels = product.sizes.map((s) => s.label);
  const recommendation = recommendSize({
    available: labels,
    keptSizes,
    fit: summariseFit(votesFor(product.id, ownFitVotes)),
  });

  const selectedStock = size ? getStock(stockOverrides, product, size) : 0;
  const allOutOfStock = product.sizes.every((s) => getStock(stockOverrides, product, s.label) === 0);

  function handleAddToCart() {
    if (!size) {
      toast.error("Please select a size");
      return;
    }
    if (selectedStock === 0) {
      toast.error(`Size ${size} is out of stock`);
      return;
    }
    decrementStock(product.id, size, 1, selectedStock);
    addLine({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.images[0],
      price: product.price,
      currency: product.currency,
      subcategory: product.subcategory,
      size,
      color,
      qty: 1,
    });
    track({
      name: "add_to_cart",
      productId: product.id,
      size,
      qty: 1,
      price: product.price,
    });
    toast.success(`${product.name} added to bag`);
  }

  function handleBuyNow() {
    handleAddToCart();
    router.push("/shop/cart");
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-neutral-700">
          Color: <span className="font-normal text-neutral-500">{color}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {product.colors.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                c === color
                  ? "border-rose-600 bg-rose-50 text-rose-700"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-700">Select Size</p>
          <SizeGuideModal sizes={labels} />
        </div>

        {recommendation && (
          <button
            type="button"
            onClick={() => setSize(recommendation.size)}
            className="mb-2 flex w-full items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-2.5 text-left text-xs text-neutral-700 hover:border-rose-400"
          >
            <span className="font-medium text-rose-700">Try {recommendation.size}</span>
            <span className="text-neutral-500">{recommendation.reason}</span>
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          {product.sizes.map((s) => {
            const stock = getStock(stockOverrides, product, s.label);
            const available = stock > 0;
            return (
              <button
                key={s.label}
                type="button"
                disabled={!available}
                onClick={() => setSize(s.label)}
                title={available ? undefined : "Out of stock"}
                className={cn(
                  "h-10 min-w-10 rounded-md border px-3 text-sm font-medium",
                  !available && "cursor-not-allowed border-neutral-200 text-neutral-300 line-through",
                  available && s.label === size && "border-rose-600 bg-rose-50 text-rose-700",
                  available &&
                    s.label !== size &&
                    "border-neutral-300 text-neutral-700 hover:border-neutral-400"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {size && selectedStock > 0 && selectedStock <= LOW_STOCK_THRESHOLD && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            Only {selectedStock} left in size {size}
          </p>
        )}
      </div>

      <BackInStockNotify product={product} />

      <DeliveryEstimator />

      <div className="flex gap-3">
        <Button
          variant="retail"
          size="lg"
          className="flex-1"
          disabled={allOutOfStock}
          onClick={handleAddToCart}
        >
          {allOutOfStock ? "Out of Stock" : "Add to Bag"}
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          disabled={allOutOfStock}
          onClick={handleBuyNow}
        >
          Buy Now
        </Button>
      </div>

      <p className="text-xs text-neutral-400">
        Price inclusive of all taxes. {formatPrice(product.price)} per unit.
      </p>
    </div>
  );
}
