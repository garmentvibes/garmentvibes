"use client";

import { Ruler } from "lucide-react";

import { cn } from "@/lib/utils";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { useFitFeedbackStore, votesFor } from "@/lib/stores/fit-feedback-store";
import { FIT_VOTE_LABELS, MIN_FIT_VOTES, summariseFit, type FitVote } from "@/lib/fit";

const ORDER: FitVote[] = ["small", "true", "large"];

/**
 * "How did it fit?" — the summary of what buyers reported, and a way to add to
 * it.
 *
 * This is the highest-signal thing an apparel page can say, and the one thing
 * a measurement chart cannot: a chart tells you what the garment measures, not
 * whether it comes up short on the people who bought it.
 */
export function FitFeedback({ productId }: { productId: string }) {
  const mounted = useHasMounted();
  const ownVotes = useFitFeedbackStore((s) => s.votes);
  const setVote = useFitFeedbackStore((s) => s.setVote);

  // Before hydration the persisted vote is unknown, so rendering would show
  // the un-voted state and then flip.
  if (!mounted) return null;

  const votes = votesFor(productId, ownVotes);
  const summary = summariseFit(votes);
  const mine = ownVotes[productId];

  return (
    <section aria-labelledby="fit-heading" className="rounded-lg border border-neutral-200 bg-white p-4">
      <h3 id="fit-heading" className="flex items-center gap-2 font-semibold text-neutral-900">
        <Ruler className="h-4 w-4 text-rose-600" /> How did it fit?
      </h3>

      {summary.verdict ? (
        <>
          <p className="mt-2 text-sm text-neutral-700">
            <span className="font-medium">{summary.percent}%</span> of{" "}
            {summary.total} buyers said{" "}
            <span className="font-medium">{FIT_VOTE_LABELS[summary.verdict].toLowerCase()}</span>.
          </p>
          <p className="mt-1 text-sm text-neutral-500">{summary.advice}</p>

          <div className="mt-3 space-y-1.5">
            {ORDER.map((vote) => {
              const share = Math.round((summary.counts[vote] / summary.total) * 100);
              return (
                <div key={vote} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 text-neutral-500">{FIT_VOTE_LABELS[vote]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <span
                      className="block h-full rounded-full bg-rose-500"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-neutral-400">
                    {share}%
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-neutral-500">
          {summary.total === 0
            ? "No fit feedback yet."
            : `Only ${summary.total} ${summary.total === 1 ? "person has" : "people have"} rated the fit — not enough to call it yet.`}{" "}
          {summary.total < MIN_FIT_VOTES && "Be one of the first to help."}
        </p>
      )}

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <p className="text-xs font-medium text-neutral-600">
          {mine ? "You said:" : "Bought this? Tell others how it fits."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORDER.map((vote) => (
            <button
              key={vote}
              type="button"
              aria-pressed={mine === vote}
              onClick={() => setVote(productId, vote)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                mine === vote
                  ? "border-rose-600 bg-rose-50 text-rose-700"
                  : "border-neutral-300 text-neutral-600 hover:border-neutral-400"
              )}
            >
              {FIT_VOTE_LABELS[vote]}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
