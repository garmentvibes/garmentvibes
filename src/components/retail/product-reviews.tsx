import { Star, BadgeCheck } from "lucide-react";
import type { RetailReview } from "@/lib/mock/retail-reviews";

export function ProductReviews({ reviews }: { reviews: RetailReview[] }) {
  return (
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
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-500">
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
  );
}
