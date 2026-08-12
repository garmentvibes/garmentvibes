"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { WishlistButton } from "@/components/retail/wishlist-button";

export function ProductGallery({
  images,
  productId,
  alt,
}: {
  images: string[];
  productId: string;
  alt: string;
}) {
  const [active, setActive] = useState(0);

  return (
    <div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[active]} alt={alt} className="h-full w-full object-cover" />
        <WishlistButton productId={productId} className="absolute right-3 top-3" />
      </div>

      {images.length > 1 && (
        <div className="mt-3 flex gap-2">
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              onClick={() => setActive(i)}
              className={cn(
                "h-16 w-14 overflow-hidden rounded-md border-2",
                i === active ? "border-rose-600" : "border-transparent"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt={`${alt} thumbnail ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
