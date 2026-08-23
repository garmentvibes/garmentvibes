// ---------------------------------------------------------------------------
// Fit confidence.
//
// Fit is the top return reason in Indian apparel, and `return_reason` puts
// `size_or_fit` first for that reason. Everything here exists to reduce the
// number of garments that come back because they did not fit, which is money
// twice: the outbound leg, the return leg, and a garment that may not be
// re-sellable.
//
// Two problems, one module:
//
//   1. The size guide was a single S/M/L/XL chart shown on every product. The
//      catalogue has four size systems — alpha, waist inches, kids' ages and
//      free size — so a customer buying 32" jeans or a 4-5Y frock was shown a
//      chart that does not mention their size at all. That is worse than no
//      chart: it looks like an answer.
//
//   2. Nothing told a customer how a garment runs. "62% of buyers say this is
//      true to size" is the highest-signal thing a clothing page can say, and
//      it is the one thing a size chart cannot tell you.
// ---------------------------------------------------------------------------

export type SizeSystem = "alpha" | "waist" | "kids" | "free";

/**
 * Works out which sizing system a product uses from its own size labels.
 *
 * Derived rather than stored: the labels are already the truth, and a separate
 * field would be one more thing to get wrong when a product is added.
 */
export function sizeSystem(labels: string[]): SizeSystem {
  if (labels.some((l) => /^\d+\s*-\s*\d+\s*Y$/i.test(l.trim()))) return "kids";
  if (labels.some((l) => /^\d{2}$/.test(l.trim()))) return "waist";
  if (labels.some((l) => /^(XS|S|M|L|XL|XXL|\d?XL)$/i.test(l.trim()))) return "alpha";
  return "free";
}

export interface SizeChartRow {
  size: string;
  /** Measurement columns, in the order the headings declare. */
  values: string[];
}

export interface SizeChart {
  /** Column headings after the size column. */
  headings: string[];
  rows: SizeChartRow[];
  /** Shown under the table. Says what to measure, not what to buy. */
  note: string;
}

// All measurements in inches, which is what Indian apparel labels use.
//
// PLACEHOLDER DATA. These are standard-ish ranges, not measurements of the
// actual garments — nobody has put a tape measure over the real stock yet.
// Publishing a chart that does not match what ships is how a size guide
// creates returns instead of preventing them, so replace these per product
// range before launch.
const CHARTS: Record<SizeSystem, SizeChart> = {
  alpha: {
    headings: ["Chest", "Waist", "Length"],
    rows: [
      { size: "S", values: ["34-36", "28-30", "27"] },
      { size: "M", values: ["38-40", "32-34", "28"] },
      { size: "L", values: ["42-44", "36-38", "29"] },
      { size: "XL", values: ["46-48", "40-42", "30"] },
    ],
    note: "Measure around the fullest part of your chest, keeping the tape level.",
  },
  waist: {
    headings: ["Waist", "Hip", "Inseam"],
    rows: [
      { size: "28", values: ["28", "36", "30"] },
      { size: "30", values: ["30", "38", "30"] },
      { size: "32", values: ["32", "40", "31"] },
      { size: "34", values: ["34", "42", "31"] },
    ],
    note: "Waist is the label size. Measure a pair that fits you well, laid flat, rather than your body.",
  },
  kids: {
    headings: ["Height", "Chest", "Length"],
    rows: [
      { size: "2-3Y", values: ["36-39", "21", "16"] },
      { size: "4-5Y", values: ["40-43", "23", "18"] },
      { size: "6-7Y", values: ["44-47", "25", "20"] },
      { size: "8-9Y", values: ["48-51", "27", "22"] },
    ],
    note: "Go by height rather than age — children of the same age vary a lot. If between two, size up.",
  },
  free: {
    headings: [],
    rows: [],
    note: "This item is free size and is cut to fit a range of body types. Check the description for the unstitched length and width.",
  },
};

/** The chart matching a product's own sizes. */
export function sizeChartFor(labels: string[]): SizeChart {
  return CHARTS[sizeSystem(labels)];
}

// ---------------------------------------------------------------------------
// Buyer fit feedback
// ---------------------------------------------------------------------------

export type FitVote = "small" | "true" | "large";

export const FIT_VOTE_LABELS: Record<FitVote, string> = {
  small: "Runs small",
  true: "True to size",
  large: "Runs large",
};

export interface FitSummary {
  total: number;
  counts: Record<FitVote, number>;
  /** The majority verdict, or null when there is not enough to say. */
  verdict: FitVote | null;
  /** Percentage backing the verdict, 0-100. Zero when there is no verdict. */
  percent: number;
  /** What to do about it: size up, size down, or take your usual. */
  advice: string | null;
}

/**
 * Below this, the sample says nothing. Three people is not a trend, and
 * "100% say runs small" off one vote is worse than silence — it reads as
 * confident and is not.
 */
export const MIN_FIT_VOTES = 5;

export function summariseFit(votes: FitVote[]): FitSummary {
  const counts: Record<FitVote, number> = { small: 0, true: 0, large: 0 };
  for (const vote of votes) counts[vote] += 1;

  const total = votes.length;
  if (total < MIN_FIT_VOTES) {
    return { total, counts, verdict: null, percent: 0, advice: null };
  }

  const entries = Object.entries(counts) as Array<[FitVote, number]>;
  // Sorted by count, then by the fixed order of the vote list, so a tie
  // resolves the same way every render rather than by object key order.
  const [verdict, top] = entries.sort((a, b) => b[1] - a[1] || 0)[0];
  const percent = Math.round((top / total) * 100);

  const ADVICE: Record<FitVote, string> = {
    small: "Most buyers found this runs small — consider sizing up.",
    true: "Most buyers found this true to size — take your usual.",
    large: "Most buyers found this runs large — consider sizing down.",
  };

  return { total, counts, verdict, percent, advice: ADVICE[verdict] };
}

// ---------------------------------------------------------------------------
// Size recommendation
// ---------------------------------------------------------------------------

export interface SizeRecommendation {
  size: string;
  /** Shown to the customer. Says where the suggestion came from. */
  reason: string;
}

/**
 * Suggests a size from what this customer has already bought and kept.
 *
 * Kept is the operative word: a size that came back is evidence against
 * itself, so a returned purchase must not become a recommendation. That is
 * the difference between "you usually buy M" and "M works for you".
 *
 * Adjusted by the fit verdict — if the crowd says a garment runs small, the
 * customer's usual size is one step too small for this one.
 */
export function recommendSize(input: {
  /** Sizes available on this product. */
  available: string[];
  /** Sizes this customer bought and did not return, most recent first. */
  keptSizes: string[];
  fit: FitSummary;
}): SizeRecommendation | null {
  const system = sizeSystem(input.available);
  if (system === "free") return null;

  // Only sizes in the same system are comparable. A customer's history of
  // buying "32" jeans says nothing about which kurta size to suggest.
  const usual = input.keptSizes.find(
    (size) => sizeSystem([size]) === system && input.available.includes(size)
  );
  if (!usual) return null;

  const order = CHARTS[system].rows.map((row) => row.size);
  const index = order.indexOf(usual);

  if (index === -1 || !input.fit.verdict || input.fit.verdict === "true") {
    return { size: usual, reason: `You bought size ${usual} last time and kept it.` };
  }

  const shift = input.fit.verdict === "small" ? 1 : -1;
  const adjusted = order[index + shift];

  // No larger (or smaller) size exists, or we do not stock it. Falling back to
  // their usual is honest; inventing a size is not.
  if (!adjusted || !input.available.includes(adjusted)) {
    return { size: usual, reason: `You bought size ${usual} last time and kept it.` };
  }

  return {
    size: adjusted,
    reason: `You usually take ${usual}, and most buyers say this one runs ${
      input.fit.verdict === "small" ? "small" : "large"
    }.`,
  };
}
