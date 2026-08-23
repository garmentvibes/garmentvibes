// Per-caller request limiting for the payment endpoints.
//
// WHAT THIS IS NOT: a defence against a distributed flood. It counts requests
// in the memory of one server process, so on any platform that runs more than
// one instance the effective limit is the configured limit times the number of
// instances, and every deploy resets the counters. Real protection needs a
// shared store — a Supabase table or Upstash — and platform-level DDoS
// filtering in front of that. This is deliberately the cheap version: it stops
// one script hammering checkout from a laptop, which is the realistic threat
// for a shop this size, and it is written so the storage can be swapped
// without touching the routes.
//
// The trust boundary matters more than the algorithm. See callerKey().

/** A sliding window, so a caller cannot burst twice the limit across a boundary. */
export interface RateLimitOptions {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Maximum distinct callers tracked at once.
   *
   * Without a cap the limiter is itself a memory-exhaustion vector: every
   * forged caller key would allocate an entry that lives for the window. When
   * full, the least recently seen caller is evicted — it loses its history and
   * gets a fresh allowance, which is the right way to fail. Refusing new
   * callers instead would turn a flood into an outage for everyone else.
   */
  maxKeys?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still permitted in the current window. */
  remaining: number;
  /** Seconds until the caller may retry. Zero when allowed. */
  retryAfterSeconds: number;
}

const DEFAULT_MAX_KEYS = 10_000;

export function createRateLimiter({ limit, windowMs, maxKeys = DEFAULT_MAX_KEYS }: RateLimitOptions) {
  if (limit < 1) throw new Error("Rate limit must permit at least one request");
  if (windowMs < 1) throw new Error("Rate limit window must be positive");

  // Caller key -> timestamps of its requests inside the current window. Bounded
  // by `limit` entries per caller, so the memory cost is limit × maxKeys.
  const hits = new Map<string, number[]>();

  return {
    /**
     * Records a request and says whether it is permitted.
     *
     * `now` is a parameter rather than a call to Date.now() inside, so the
     * window behaviour can be tested without waiting in real time — the same
     * reason the GST and credit helpers take a clock.
     */
    check(key: string, now: number = Date.now()): RateLimitResult {
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

      if (recent.length >= limit) {
        // Oldest request in the window decides when room frees up.
        const retryAfterMs = recent[0] + windowMs - now;
        // Re-set so this caller's entry counts as recently seen and is not the
        // first evicted while it is actively being limited.
        hits.set(key, recent);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      recent.push(now);
      // Delete before set so the Map's insertion order tracks recency, which is
      // what makes the eviction below least-recently-used rather than arbitrary.
      hits.delete(key);
      hits.set(key, recent);

      if (hits.size > maxKeys) {
        const oldest = hits.keys().next();
        if (!oldest.done) hits.delete(oldest.value);
      }

      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },

    /**
     * Reports whether a request WOULD be permitted, without recording it.
     *
     * For endpoints where only some outcomes should count against the budget.
     * Sign-in is the case that needed it: the limit exists to stop password
     * guessing, and a successful sign-in is not a guess — counting it locks
     * out someone who legitimately signs in on a phone, a laptop and a tablet
     * inside a minute. So the action peeks first, and only records a failure.
     */
    peek(key: string, now: number = Date.now()): RateLimitResult {
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

      if (recent.length >= limit) {
        const retryAfterMs = recent[0] + windowMs - now;
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },

    /** Distinct callers currently tracked. Exposed for tests and diagnostics. */
    size() {
      return hits.size;
    },

    reset() {
      hits.clear();
    },
  };
}

/**
 * Identifies the caller for limiting purposes.
 *
 * Next removed `request.ip` in 15 — the value comes from the host — so this
 * reads headers, and which header is trustworthy depends entirely on what sits
 * in front of the app:
 *
 *   - On Vercel, `x-vercel-forwarded-for` is set by the platform and cannot be
 *     forged by the client, so it is preferred.
 *   - `x-forwarded-for` is trustworthy ONLY when a proxy you control
 *     overwrites it. Exposed directly, a client sets it freely and rotates
 *     through invented addresses, and the limit stops meaning anything.
 *
 * Falling back to a single shared key when no header is present is deliberate:
 * an unattributable request should share one bucket rather than get its own
 * unlimited one. It makes the limiter stricter when it cannot identify anyone,
 * which is the safe direction to fail.
 */
export function callerKey(headers: Headers): string {
  const vercel = headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();

  const forwarded = headers.get("x-forwarded-for");
  // Left-most entry is the original client; everything after is proxy hops.
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "unidentified";
}

/** Headers describing the caller's current allowance, for a 200 or a 429. */
export function rateLimitHeaders(limit: number, result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(result.remaining),
  };
  if (!result.allowed) headers["Retry-After"] = String(result.retryAfterSeconds);
  return headers;
}
