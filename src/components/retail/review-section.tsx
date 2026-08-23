"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Star, BadgeCheck, PenLine, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useReviewsStore, useProductReviews } from "@/lib/stores/reviews-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { usePurchasedProductIds } from "@/lib/hooks/use-purchased-products";
import {
  MAX_PHOTOS,
  downscaleToDataUrl,
  remainingSlots,
  validatePhotoFile,
} from "@/lib/review-photos";
import type { RetailReview } from "@/lib/mock/retail-reviews";

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange?: (v: number) => void;
}) {
  const interactive = Boolean(onChange);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star className={cn("h-5 w-5", filled ? "fill-amber-400 text-amber-400" : "text-neutral-300")} />
        );
        return interactive ? (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onClick={() => onChange?.(n)}
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </div>
  );
}

export function ReviewSection({
  productId,
  productName,
  seededReviews,
}: {
  productId: string;
  productName: string;
  seededReviews: RetailReview[];
}) {
  const mounted = useHasMounted();
  const reviews = useProductReviews(productId, seededReviews);
  const addReview = useReviewsStore((s) => s.addReview);
  const user = useSessionStore((s) => s.user);

  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const signedIn = mounted && user?.role === "retail";

  // Whether this reviewer actually received the product. Derived, never
  // asserted by the reviewer — a badge the writer can set is not a badge.
  const purchased = usePurchasedProductIds();
  const hasPurchased = purchased.has(productId);

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;

    const slots = remainingSlots(photos.length);
    if (slots === 0) {
      toast.error(`Up to ${MAX_PHOTOS} photos per review`);
      return;
    }

    const accepted: string[] = [];
    // Only as many as there is room for. Silently dropping the rest would be
    // worse than saying so, so the count is reported below.
    for (const file of Array.from(files).slice(0, slots)) {
      const check = validatePhotoFile(file);
      if (!check.ok) {
        toast.error(check.error);
        continue;
      }
      try {
        accepted.push(await downscaleToDataUrl(file));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That photo could not be read");
      }
    }

    if (accepted.length > 0) setPhotos((current) => [...current, ...accepted]);
    if (files.length > slots) {
      toast.info(`Added ${accepted.length} — a review can carry ${MAX_PHOTOS} photos.`);
    }

    // Reset so re-picking the same file fires a change event again.
    if (fileInput.current) fileInput.current.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Pick a star rating");
      return;
    }
    if (!title.trim() || !body.trim()) {
      toast.error("Add a title and a few words about the product");
      return;
    }
    addReview({
      productId,
      author: user?.name ?? "Anonymous",
      rating,
      // Locale-independent so the stored value doesn't shift by timezone.
      date: new Date().toISOString().slice(0, 10),
      title: title.trim(),
      body: body.trim(),
      // Real now: the order history says whether this customer received it.
      // This was hardcoded false with a note that verification had to wait for
      // the database, but delivered orders were readable all along.
      verified: hasPurchased,
      photos: photos.length > 0 ? photos : undefined,
    });
    toast.success("Thanks for your review!");
    setWriting(false);
    setRating(0);
    setTitle("");
    setBody("");
    setPhotos([]);
  }

  // Averages should reflect what's actually displayed.
  const average =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : "—";

  return (
    <section className="mt-14 max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            Ratings &amp; Reviews ({reviews.length})
          </h2>
          {reviews.length > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <StarRating value={Math.round(Number(average))} />
              <span className="text-sm text-neutral-500">{average} out of 5</span>
            </div>
          )}
        </div>

        {!writing &&
          (signedIn ? (
            <Button variant="outline" size="sm" onClick={() => setWriting(true)}>
              <PenLine className="mr-1.5 h-4 w-4" /> Write a review
            </Button>
          ) : (
            mounted && (
              <Link href={`/shop/login?redirect=/shop/product`}>
                <Button variant="outline" size="sm">
                  Sign in to review
                </Button>
              </Link>
            )
          ))}
      </div>

      {writing && (
        <form onSubmit={submit} className="mb-6 space-y-3 rounded-lg border border-neutral-200 p-5">
          <p className="text-sm font-medium text-neutral-800">
            Reviewing <span className="text-neutral-600">{productName}</span>
          </p>

          <div>
            <Label htmlFor="review-rating">Your rating</Label>
            <div id="review-rating" className="mt-1">
              <StarRating value={rating} onChange={setRating} />
            </div>
          </div>

          <div>
            <Label htmlFor="review-title">Title</Label>
            <Input
              id="review-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sum it up in a few words"
            />
          </div>

          <div>
            <Label htmlFor="review-body">Your review</Label>
            <textarea
              id="review-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What did you like or dislike? How was the fit and fabric?"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
          </div>

          <div>
            <Label htmlFor="review-photos">Photos (optional)</Label>
            <p className="mt-0.5 text-xs text-neutral-500">
              A photo of the garment as it actually arrived is the most useful thing you can add.
              Up to {MAX_PHOTOS}.
            </p>

            {photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos.map((src, i) => (
                  <div key={src.slice(-32)} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a
                        data: URL has nothing for next/image to optimise, and
                        routing it through the optimiser would only re-encode
                        an image we have already downscaled. */}
                    <img
                      src={src}
                      alt={`Your photo ${i + 1}`}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => setPhotos(photos.filter((p) => p !== src))}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-neutral-900 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {remainingSlots(photos.length) > 0 && (
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:border-neutral-400">
                <ImagePlus className="h-4 w-4" />
                Add photo
                <input
                  id="review-photos"
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => addPhotos(e.target.files)}
                />
              </label>
            )}
          </div>

          {!hasPurchased && (
            <p className="text-xs text-neutral-500">
              We can&apos;t match this to a delivered order, so your review won&apos;t carry a
              verified-purchase badge.
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" variant="retail" size="sm">
              Submit review
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setWriting(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-5">
        {reviews.map((review) => (
          <div key={review.id} className="border-b border-neutral-100 pb-5 last:border-0">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 rounded bg-green-700 px-1.5 py-0.5 text-xs font-semibold text-white">
                {review.rating} <Star className="h-3 w-3 fill-white" />
              </span>
              <p className="text-sm font-medium text-neutral-900">{review.title}</p>
            </div>
            <p className="mt-1.5 text-sm text-neutral-600">{review.body}</p>

            {review.photos && review.photos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {review.photos.map((src, i) => (
                  // A data: URL has nothing for next/image to optimise, and
                  // routing it through the optimiser would re-encode an image
                  // already downscaled in the browser.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={src.slice(-32)}
                    src={src}
                    alt={`Customer photo ${i + 1} for ${productName}`}
                    className="h-20 w-20 rounded-md object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
              <span>{review.author}</span>
              <span>&middot;</span>
              <span>{review.date}</span>
              {review.verified && (
                <span className="flex items-center gap-0.5 text-green-700">
                  <BadgeCheck className="h-3 w-3" /> Verified Purchase
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
