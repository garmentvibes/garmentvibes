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
npm run qa:schema    # applies the migrations to a scratch Postgres, tests the RLS policies
```

`qa:schema` needs a local Postgres rather than a running app. It skips itself
if there isn't one, so `npm run qa` stays usable — except under `CI`, where a
missing server is a failure instead, since a service container that failed to
start would otherwise make the job pass without checking anything.

```bash
pg_ctlcluster 16 main start    # Debian/Ubuntu
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

- **`npm test`** (`vitest run`) — unit tests over the pure functions the
  browser suites can only reach clumsily: GST arithmetic and slab
  boundaries, return/claim window edges, Razorpay signature verification,
  order pricing rejections, and credit ageing. Runs in under a second, so it
  goes before the build in CI — a broken invariant should fail without
  waiting on a compile.
  - These were checked with mutation testing rather than trusted because
    they were green: breaking the rounding in `splitTaxInclusive` and the
    return-window boundary each fail exactly one test.
  - **Known blind spot:** swapping `timingSafeEqual` for `a === b` in
    `signature.ts` passes every test, because the two agree on every
    accept/reject and differ only in timing. Treat any change to that
    comparison as unreviewed by the test suite.
- **`qa:static`** also checks **sitemap coverage**: every public static page
  must either appear in `sitemap.ts` or be disallowed in `robots.txt`. A page
  missing from the sitemap is otherwise invisible to this suite — it still
  renders, its links still resolve, nothing fails — it just never gets
  crawled. That is exactly how the Refund Policy and Grievance pages, which
  Razorpay reads during merchant onboarding, sat unlisted. `robots.txt` is
  the source of truth for what may be excluded, so there is no second
  allow-list to keep in step.
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
  admin chain of approve → picked up → refunded), exchanges (replacement size
  picker excluding the size being sent back, and the divergent Ship-exchange
  branch), shipment tracking end to end, promo code management including the
  built-in-undeletable rule, back-in-stock registration and firing, and the
  notification outbox (approving an account and shipping an
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
- ⚠️ **Wholesale prices are treated as GST-EXCLUSIVE** (tax added on top),
  the opposite of retail. That is standard B2B practice, but which convention
  your actual price list uses is a business decision — confirm it, because
  getting it backwards either overcharges the buyer or eats the tax out of
  margin. The buyer's GSTIN on a wholesale invoice is resolved from their
  account; a production system should snapshot it onto the order at the time
  of supply, since a business can re-register later.
- **Admin-created promo codes are browser-side only.** The built-in codes in
  `lib/pricing.ts` are compiled into the server's validation list, which is
  what `/api/razorpay/order` checks; codes created in `/admin/promos` work in
  the checkout UI, but the payment route will not honour them until promos
  live in the database. Built-ins can be deactivated but not deleted, so the
  two lists can never contradict each other.
- Exchange price differences are *shown and recorded* but not *settled* —
  collecting a top-up or refunding the difference needs the payment provider,
  so the admin queue tells staff how much to collect or refund and they do it
  out of band for now
- Wholesale claims resolve to a credit note or replacement, but the credit
  note is not yet posted to the credit ledger automatically — the two systems
  meet once orders and invoices live in the database
- No warehouse inventory sync — stock is the local store, though returns and
  exchanges now move it correctly. Returns restock only for reasons where the
  unit is actually sellable: damaged and poor-quality returns are deliberately
  **not** put back on the shelf.
- No transactional email/SMS/WhatsApp **delivery** — messages are composed
  from real templates and queued into the outbox (`/admin/notifications`),
  where staff can read exactly what a customer would receive, but no
  provider is connected so nothing leaves the system. Wiring one up means
  implementing a `send()` against the queued messages; the templates and
  call sites do not change.
- No analytics or error-tracking **provider** — `src/lib/analytics.ts`
  buffers events and error reports and gates delivery on
  `NEXT_PUBLIC_ANALYTICS_KEY`, which is intentionally unset

### Content Security Policy: a deliberate trade-off

`next.config.ts` sets a CSP plus HSTS, nosniff, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy` on every route including the API.

`script-src` keeps `'unsafe-inline'`, which is a genuine weakening: this
policy does **not** stop an injected inline `<script>`. The strict
nonce-based CSP that Next.js documents needs a fresh nonce per request and
therefore dynamic rendering, which would give up static prerendering across
~60 product pages and every content page — real cost for a catalogue with no
user-generated content.

What the policy *does* stop: script from an unapproved origin, framing,
form hijacking to a third-party endpoint, plugin content, and base-tag
rewriting.

**Revisit this the moment user-generated content renders as HTML** — reviews,
seller-supplied copy, anything of that shape. At that point move to nonces in
`proxy.ts` per the Next.js CSP guide and accept dynamic rendering.

Note that `qa:routes` doubles as CSP-violation detection: violations surface
as console errors, and that sweep fails on any console error.

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
- `NEXT_PUBLIC_*` variables are inlined at **build** time, not read at
  runtime. Setting `NEXT_PUBLIC_SITE_URL` when starting the server has no
  effect whatsoever — the value baked in at `next build` is what ships. A
  deployment platform must set it as a build environment variable.
  The corollary bit us a second time: a *check* that asserts against
  `process.env.NEXT_PUBLIC_SITE_URL` compares the baked-in value to whatever
  the test process happens to see, so setting it only on CI's build step made
  the QR check compare `https://ci.garmentvibes.test` against a default of
  `http://localhost:3000`. It is now declared once at the **job** level so the
  build and the suites cannot drift apart.
- Playwright's `waitUntil: "networkidle"` is a trap for a Next.js app. Once
  Next prefetches linked routes in the background, the mega-menu alone keeps
  RSC requests open and the network is never idle, so every navigation times
  out. It was the wrong signal even before that — it guessed readiness from
  traffic and never actually guaranteed hydration. The suites now wait for
  `data-hydrated` on `<html>`, set by StoreHydrator once the persisted stores
  are live. Faster and truthful.
- `locator().count()` resolves immediately, so asserting presence right after
  a navigation races the first render of a client island. Use the `appears()`
  helper for "should be there" and plain `count()` only for "should be
  absent".
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

## Lessons from testing the schema (2026-08)

- Writing SQL is not testing SQL. The first run of `qa:schema` against the
  existing `0001_init.sql` — which had been reviewed and looked fine — found
  that it could not be applied twice and that **six of its foreign keys had no
  index**, making "my orders" a sequential scan of every order in the system.
  Both were invisible on reading.
- "RLS is enabled" is not a security check. A policy reading `using (true)`
  satisfies it. The only assertion with any force is becoming two different
  users and comparing what each can see, which is why the suite switches
  identity via `set local role authenticated` plus the `request.jwt.claim.sub`
  GUC that `auth.uid()` reads.
- A Postgres **view bypasses RLS by default**, running with its owner's
  privileges. `credit_invoice_balances` over `credit_invoices` would have handed
  every business every other business's debts. `with (security_invoker = true)`
  fixes it, and the test that proves it fails without it.
- A policy on `profiles` that calls a function which reads `profiles` recurses
  until Postgres gives up. `security definer` breaks the cycle — and then
  `set search_path` is mandatory, because a definer function resolving table
  names through the caller's path can be aimed at a shadow table.
- `alter type ... add value` may run inside a transaction, but the new value
  cannot be *used* until it commits. Since each migration file is one
  transaction, enum extensions need their own file (`0002`).
- Postgres parses SQL function bodies at creation time, so a function cannot be
  defined before a column it reads. Ordering within a migration matters.
- Mutation-tested, as with the browser suites: breaking the stock constraint,
  the write-off guard, the order policy and the view's `security_invoker` each
  produced exactly one failure naming the right assertion.
- The skip-if-no-Postgres convenience was itself a hole — in CI a service
  container that failed to start would have made the job pass silently. It now
  refuses to skip when `CI` is set.
