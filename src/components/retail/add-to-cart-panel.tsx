"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SizeGuideModal } from "@/components/retail/size-guide-modal";
import { DeliveryEstimator } from "@/components/retail/delivery-estimator";
import { cn, formatPrice } from "@/lib/utils";
import { useCartStore } from "@/lib/stores/cart-store";
import { useStockStore, getStock, LOW_STOCK_THRESHOLD } from "@/lib/stores/stock-store";
import type { RetailProduct } from "@/types/catalog";

export function AddToCartPanel({ product }: { product: RetailProduct }) {
  const [size, setSize] = useState(product.sizes.find((s) => s.inStock)?.label ?? "");
  const [color, setColor] = useState(product.colors[0] ?? "");
  const addLine = useCartStore((s) => s.addLine);
  const decrementStock = useStockStore((s) => s.decrement);
  const stockOverrides = useStockStore((s) => s.overrides);
  const router = useRouter();

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
      size,
      color,
      qty: 1,
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
          <SizeGuideModal />
        </div>
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
