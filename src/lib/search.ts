// Fuzzy search shared by the retail and wholesale storefronts.
//
// Substring matching alone fails the most common real query problem: typos
// ("kurtaa", "jenas"). This adds bounded edit-distance matching per word, so
// near-misses still rank, while keeping exact/prefix matches strictly ahead.

/** Levenshtein distance, capped — returns `max + 1` once it's clearly too far. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1; // whole row exceeded the budget
    prev = curr;
  }
  return prev[b.length];
}

// Longer words tolerate more typos; very short ones tolerate none, or
// "top" would match "toy", " top" -> "tip", etc.
function typoBudget(word: string) {
  if (word.length <= 3) return 0;
  if (word.length <= 6) return 1;
  return 2;
}

export interface SearchableItem {
  /** Weighted fields, most significant first (e.g. name, then brand). */
  fields: string[];
}

/**
 * Score one item against a query. Higher is better; 0 means no match.
 * Every query word must match something, so "red kurta" doesn't return
 * everything red *or* every kurta.
 */
export function scoreMatch(query: string, fields: string[]): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const queryWords = q.split(/\s+/).filter(Boolean);
  const haystacks = fields.map((f) => f.toLowerCase());

  let total = 0;

  for (const qw of queryWords) {
    let best = 0;

    haystacks.forEach((hay, fieldIndex) => {
      // Earlier fields are worth more (name beats subcategory).
      const fieldWeight = 1 / (fieldIndex + 1);

      if (hay === qw) {
        best = Math.max(best, 100 * fieldWeight);
        return;
      }
      if (hay.startsWith(qw)) {
        best = Math.max(best, 80 * fieldWeight);
        return;
      }
      if (hay.includes(qw)) {
        best = Math.max(best, 60 * fieldWeight);
        return;
      }

      // Word-level: prefix or typo-tolerant match within the field.
      for (const hw of hay.split(/[\s&,/-]+/).filter(Boolean)) {
        if (hw.startsWith(qw)) {
          best = Math.max(best, 70 * fieldWeight);
          continue;
        }
        const budget = typoBudget(qw);
        if (budget > 0) {
          const dist = editDistance(qw, hw, budget);
          if (dist <= budget) {
            // Closer matches score higher; still below any exact/prefix hit.
            best = Math.max(best, (40 - dist * 10) * fieldWeight);
          }
        }
      }
    });

    if (best === 0) return 0; // this query word matched nothing
    total += best;
  }

  return total;
}

/** Rank items by relevance, dropping non-matches. */
export function fuzzySearch<T>(
  query: string,
  items: T[],
  getFields: (item: T) => string[],
  limit?: number
): T[] {
  const scored = items
    .map((item) => ({ item, score: scoreMatch(query, getFields(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return (limit ? scored.slice(0, limit) : scored).map((x) => x.item);
}
