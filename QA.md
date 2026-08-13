# QA Checklist & Methodology

A reusable QA pass for GarmentVibes — run this after any meaningful batch of
changes, and always before a deploy. It's written so a future session (or a
human) can follow it without re-deriving what "done" means.

## Automated checks

All scripts live in `scripts/qa/`. They need a running server (except
`qa:static`, which is pure static analysis).

```bash
npm run qa           # lint + build + static checks — no server needed, safe to chain
npm run qa:static    # link integrity + placeholder/debug leftovers, no server needed
npm run qa:routes    # visits every route: HTTP status, console errors, <title>, basic a11y
npm run qa:e2e       # drives real user flows end-to-end through the browser
npm run qa:pwa       # manifest validity, SW registration, real offline fallback test
```

`qa:routes` and `qa:e2e` need the app already running in a separate
terminal — they're kept out of the `qa` script on purpose rather than
having it manage a server's lifecycle. Start one of these first:

```bash
npm run dev                    # fastest iteration
# or, for a result closer to production:
npm run build && npm run start
```

Then run `npm run qa:routes` / `npm run qa:e2e` (or `BASE_URL=... npm run
qa:routes` to point at a deployed preview instead of localhost).

### What each script actually catches

- **`qa:static`** (`static-checks.mjs`) — parses the App Router tree from
  `src/app` and cross-checks every internal `href` found in source (both
  JSX attributes and `href:` object-literal properties used in nav/footer
  link lists) against it, accounting for route groups `(retail)` and
  dynamic segments `[slug]`. Also greps for `TODO`, `FIXME`, `Lorem ipsum`,
  and stray `console.log(`.
- **`qa:routes`** (`route-sweep.mjs`) — visits every unique page template
  once (dynamic routes get real sample slugs/categories pulled from the
  mock catalogs), and for each: asserts the expected HTTP status, zero
  console errors or uncaught exceptions, a non-empty `<title>`, and basic
  accessibility (every `<img>` has `alt`, every icon-only button/link has
  an `aria-label`, every form control has an associated label via
  `htmlFor`/wrapping `<label>`/`aria-label`/`placeholder`). Also probes an
  intentionally-nonexistent route to confirm the styled 404 fires.
- **`qa:e2e`** (`e2e-flows.mjs`) — drives the actual UI through every flow
  that encodes a real product decision, so a regression is caught
  immediately: wishlist, category filters, search, saved addresses,
  account-gated checkout with redirect-back, promo codes, COD, wholesale
  signup starting "pending" (quote allowed, direct order locked), returning
  wholesale login being "approved" (direct order + Net-30 request unlocked),
  team invites, dashboard reorder, CSV bulk upload / pricing calculator.
  Also covers the admin panel: access gating, the wholesale approval queue,
  retail order and quote status transitions, product creation, and the
  guardrail rejecting a wholesale price tier that costs *more* at higher
  quantity, the returns flow (eligibility gating by delivery date and by an
  already-open request, quantity capped at what was ordered, and the full
  admin chain of approve → picked up → refunded), and the notification outbox (approving an account and shipping an
  order each queue the right message; channel/status filters and preview
  work). Checkout asserts against the persisted outbox directly rather than
  the admin UI, since the two run in separate browser contexts and therefore
  separate localStorage. One check guards a real delivery constraint: SMS and
  WhatsApp copy must carry no subject and stay under 320 characters, because
  DLT-registered senders and Meta-approved templates reject long bodies.
  The `seo` flow additionally parses every JSON-LD block on the
  page and asserts the fields Google actually requires (offer price +
  currency + availability, aggregateRating, breadcrumb trail, FAQPage), that
  wholesale uses `AggregateOffer` with `lowPrice <= highPrice`, that
  `robots.txt`/`sitemap.xml` are served and consistent with each other, and
  that the generated OG image route returns a real PNG. One check exists
  purely to catch a 100x error: schema prices must be rupees (`1499.00`),
  not the paise we store internally.
- **`qa:pwa`** (`pwa-checks.mjs`) — validates the manifest has everything a
  browser needs to consider the app installable (including a maskable
  icon), asserts `sw.js` is served uncacheable, then actually registers the
  service worker and — with the browser context forced offline — confirms a
  navigation renders the `/offline` fallback instead of the browser's error
  page. Best run against a production build, since the SW caches
  `/_next/static` paths.

When one of these fails, treat it exactly like a failing test — read the
failure, find the cause, fix it, re-run. Don't relax an assertion to make
it pass unless the assertion was actually wrong (as some were when this
suite was first written — see "Lessons" below).

### Environment note

`scripts/qa/_launch-browser.mjs` looks for a pre-installed Chromium at a
fixed sandbox path first, and falls back to `playwright-core`'s own
resolution otherwise. On a machine without either, run
`npx playwright install chromium` once.

## Manual / visual checklist

Not everything below is automated yet — these need a human (or an agent
explicitly asked to look) periodically, especially before a real deploy:

- [ ] **Cross-browser spot check** — Safari and Firefox, not just Chromium
- [ ] **Real mobile device** — not just a resized viewport; check tap targets
      and the mega-menu's mobile accordion
- [ ] **Real install flow** — `qa:pwa` covers manifest validity and the
      offline fallback, but actually installing to a home screen (and the
      iOS Safari "Add to Home Screen" path, which never fires
      `beforeinstallprompt`) still needs a human on a real device
- [ ] **Design consistency** — spacing/type scale holds across all ~90 routes,
      not just the ones touched most recently
- [ ] **Copy proofread** — tone, typos, and that placeholder content (fake
      phone numbers, "Lorem ipsum"-style filler) is clearly labeled as such
      where it can't be removed yet
- [ ] **Color contrast** — automated `alt`/`aria-label` checks don't catch
      low-contrast text; spot check with a contrast checker on brand colors
- [ ] **Keyboard-only navigation** — tab through a full checkout and a full
      wholesale order flow with no mouse
- [ ] **Slow network** — throttle to 3G and confirm loading states
      (`loading.tsx` skeletons) actually show, not just flash

## Known gaps (intentionally out of scope for now)

These are stubbed by product decision, not oversight — don't "fix" them
without checking with the user first:

- No live Supabase — auth/session is a mock `zustand` store
  (`src/lib/stores/session-store.ts`)
- No real payment charge — the Razorpay integration is written (order
  creation, checkout handoff, signature verification, webhook receiver) but
  no merchant account exists, so `NEXT_PUBLIC_RAZORPAY_KEY_ID` /
  `RAZORPAY_KEY_SECRET` are unset and `/api/razorpay/order` answers 503.
  Checkout sees that and falls back to the simulated flow. Setting the keys
  is the only step needed to switch it on; the webhook additionally needs
  `RAZORPAY_WEBHOOK_SECRET` and a dashboard subscription pointed at
  `POST /api/razorpay/webhook`.
  - The success path cannot be exercised without real keys. What *is*
    covered: the server pricing every order from the catalog rather than
    trusting the browser, and the webhook rejecting unsigned, wrongly
    signed, foreign-secret and tampered-body requests. Those checks need
    `RAZORPAY_WEBHOOK_SECRET` set on both the server process and the test
    runner — CI sets a dummy one; locally the checks skip with a notice if
    it's absent.
  - Fulfilment on `payment.captured` is still a no-op: there is no
    server-side order store to update until Supabase lands.
- ⚠️ **GST rates and HSN codes are unverified defaults.** `src/lib/gst.ts`
  computes the split correctly (tax-inclusive back-out, CGST/SGST vs IGST by
  place of supply), but the slab thresholds and the subcategory→HSN mapping
  are engineering placeholders. **A chartered accountant must confirm both
  before a real invoice is issued** — a wrong rate or HSN on a tax invoice is
  a compliance problem, not a display bug.
- No exchange processing — returns and refunds are handled, but swapping an
  item for a different size/colour is not
- No real inventory/stock sync — an approved return does not put the unit
  back into sellable stock
- No transactional email/SMS/WhatsApp **delivery** — messages are composed
  from real templates and queued into the outbox (`/admin/notifications`),
  where staff can read exactly what a customer would receive, but no
  provider is connected so nothing leaves the system. Wiring one up means
  implementing a `send()` against the queued messages; the templates and
  call sites do not change.
- No analytics or error-tracking **provider** — `src/lib/analytics.ts`
  buffers events and error reports and gates delivery on
  `NEXT_PUBLIC_ANALYTICS_KEY`, which is intentionally unset

### ⚠️ Admin panel: must not ship publicly as-is

`/admin` is gated **in the browser only**, against the same mock session
store as the storefront — any visitor could set the role client-side. It is
safe while the app is a local/preview build with no real data behind it, and
it is excluded from `robots.txt` and the sitemap, but before anything is
deployed publicly the admin routes need:

1. Real Supabase Auth with a server-checked staff role
2. Enforcement in `src/proxy.ts` (server-side) rather than in a component
3. RLS policies so the database refuses non-staff writes even if the UI is
   bypassed

Admin catalog edits are also client-side only right now, so they don't
appear on the storefront — the panel says so in a banner. That resolves
itself when the same reads/writes move to the database.

## Lessons from the first QA pass (2026-08)

Worth keeping in mind when extending these scripts — the checker itself
had real bugs before it was trustworthy:

- `RegExp.prototype.source` always renders `/` as `\/`, which broke a naive
  string-prefix comparison against route patterns — test regexes directly
  against sample strings, don't compare `.source` text.
- A shared `g`-flagged regex reused across `.exec()` calls on multiple
  files leaks `lastIndex` between them — create a fresh regex per file.
- `<label><input/>text</label>` (implicit wrapping) is valid, accessible
  markup — an a11y checker that only looks for `label[for]` will flag a
  wall of false positives.
- The very first couple of routes hit against `next dev` can time out on
  cold-start compilation — that's Turbopack, not a bug; warm up with one
  throwaway navigation before asserting anything.
- A route intentionally returning 404 will itself log a browser-level
  "Failed to load resource: 404" console message — expected noise for that
  one probe, not a real console error.
- Playwright's `:has-text()` is a *substring* match, so
  `button:has-text("Approve")` also matches a button reading "Approved".
  Combined with `>> nth=0` that silently clicks the wrong control and the
  failure surfaces much later as an unrelated timeout. Use `:text-is()` for
  exact matches whenever one label is a prefix of another.
- Counting list rows with `ul > li` also matches nested lists inside each
  row. Give the outer list an id (e.g. `#returns-list > li`) rather than
  trusting the tag alone.
- Seed data with hard-coded dates silently expires: a fixed `deliveredAt`
  drifts out of the 7-day return window and makes that whole flow
  unreachable a week later. Derive demo dates relative to today.

This first pass also caught one genuine app bug this way (not this
session's find, but worth remembering the pattern): every persisted
`zustand` store hydrating from `localStorage` before React's hydration
pass caused SSR/CSR mismatches app-wide. Fixed via `skipHydration` +
`useSyncExternalStore`-based mount gating (`src/lib/hooks/use-has-mounted.ts`).
If you see a hydration-mismatch console error again, that's the pattern to
reach for.
