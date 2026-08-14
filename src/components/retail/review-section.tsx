"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Star, BadgeCheck, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useReviewsStore, useProductReviews } from "@/lib/stores/reviews-store";
import { useSessionStore } from "@/lib/stores/session-store";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
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

  const signedIn = mounted && user?.role === "retail";

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
      verified: false, // no purchase verification until orders live in the DB
    });
    toast.success("Thanks for your review!");
    setWriting(false);
    setRating(0);
    setTitle("");
    setBody("");
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
