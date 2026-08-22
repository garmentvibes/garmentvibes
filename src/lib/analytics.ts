// Analytics + error tracking facade.
//
// No vendor is wired up yet — we are pre-launch and the choice of provider
// (GA4, Plausible, PostHog, Sentry...) is still open. Rather than leave the
// codebase with no instrumentation and retrofit call sites later, every event
// goes through this one module. Swapping in a real provider means editing
// `deliver()` and `deliverError()` here; no call site changes.
//
// Until then events are buffered in memory and, in development, logged. The
// buffer is also what the QA suite asserts against.

export type AnalyticsEvent =
  | { name: "product_viewed"; productId: string; productName: string; price: number }
  | { name: "add_to_cart"; productId: string; size: string; qty: number; price: number }
  | { name: "remove_from_cart"; productId: string }
  | { name: "begin_checkout"; itemCount: number; value: number }
  | { name: "purchase"; orderId: string; value: number; paymentMethod: string }
  | { name: "search"; query: string; resultCount: number }
  | { name: "wishlist_add"; productId: string }
  // Fired when a returning customer acts on the recovery prompt. The value
  // is what the recovery is worth, which is the only way to tell whether the
  // prompt earns its place on the page.
  | { name: "cart_recovered"; itemCount: number; value: number }
  | { name: "quote_requested"; itemCount: number }
  | { name: "signup"; mode: "retail" | "wholesale" };

type TrackedEvent = AnalyticsEvent & { at: number };

const MAX_BUFFER = 50;
const buffer: TrackedEvent[] = [];

function enabled() {
  // A provider key is the switch. Absent (the current state) => local only.
  return Boolean(process.env.NEXT_PUBLIC_ANALYTICS_KEY);
}

// `_event` is unused until a provider is wired up here, e.g.
//   window.gtag?.("event", event.name, event);
function deliver(_event: TrackedEvent) {
  if (!enabled()) return;
}

/** Record a product/commerce event. Safe to call from anywhere, including SSR. */
export function track(event: AnalyticsEvent) {
  const tracked: TrackedEvent = { ...event, at: Date.now() };

  buffer.push(tracked);
  if (buffer.length > MAX_BUFFER) buffer.shift();

  if (process.env.NODE_ENV === "development") {
    console.info("[analytics]", tracked.name, tracked);
  }

  try {
    deliver(tracked);
  } catch {
    // Instrumentation must never break the page it is measuring.
  }
}

/** Read-only view of recent events — used by QA and the debug overlay. */
export function recentEvents(): TrackedEvent[] {
  return [...buffer];
}

// ---------------------------------------------------------------------------
// Error tracking
// ---------------------------------------------------------------------------

export interface ReportedError {
  message: string;
  stack?: string;
  digest?: string;
  context?: string;
  at: number;
}

const errorBuffer: ReportedError[] = [];

// Same as deliver(): `_report` goes live when a provider is wired up, e.g.
//   Sentry.captureException(...)
function deliverError(_report: ReportedError) {
  if (!enabled()) return;
}

export function reportError(error: unknown, context?: string) {
  const report: ReportedError = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    digest:
      error instanceof Error && "digest" in error
        ? String((error as { digest?: unknown }).digest)
        : undefined,
    context,
    at: Date.now(),
  };

  errorBuffer.push(report);
  if (errorBuffer.length > MAX_BUFFER) errorBuffer.shift();

  console.error("[error]", context ?? "unhandled", report.message);

  try {
    deliverError(report);
  } catch {
    // Same rule: reporting a failure must not itself fail loudly.
  }
}

export function recentErrors(): ReportedError[] {
  return [...errorBuffer];
}
