"use client";

import { useState } from "react";
import Image from "next/image";
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
        <Image
          src={images[active]}
          alt={alt}
          fill
          // Full width on a phone, half the row on desktop where the buying
          // panel sits alongside.
          sizes="(max-width: 768px) 100vw, 50vw"
          // The largest thing above the fold on a product page, so it is the
          // LCP element. Lazy-loading it — the default — would mean the page's
          // headline metric waits on the browser discovering it.
          priority
          className="object-cover"
        />
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
              <Image
                src={img}
                alt={`${alt} thumbnail ${i + 1}`}
                // Fixed 56×64 in the layout; no `sizes` needed because the
                // rendered size never varies with the viewport.
                width={56}
                height={64}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
