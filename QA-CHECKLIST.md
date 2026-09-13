# GarmentVibes — QA checklist

The checks to run before a push, and always before a deploy. `QA.md` explains
the suites and the reasoning; this file is the list, in the order to run it.

**Rules for this file**

1. **Every check names a control** — a way to make it fail on purpose. A check
   that has never been seen to fail is not known to work: three of these
   suites once passed while examining nothing (see P-series and S4/B1).
2. **A SKIP is not a PASS.** Record it as a skip, with the reason.
3. **Append, never delete.** When a bug escapes or a new trap turns up, add a
   check for it with the date. Retire a check by marking it *superseded*, with
   what replaced it.
4. Record each run's results in the QA report, not here — this file stays the
   procedure.

Environment for build and browser checks (CI's, and needed locally):

```bash
export NEXT_PUBLIC_SITE_URL=https://ci.garmentvibes.test
export RAZORPAY_WEBHOOK_SECRET=qa-test-webhook-secret
export ALLOW_DEMO_ADMIN=1
export DEMO_ADMIN_SECRET=qa-test-demo-admin-secret
```

---

## P — Preflight: is the machine telling the truth?

| ID | Check | Pass | Control |
|---|---|---|---|
| P1 | `git config core.autocrlf` is `false` for this clone and files are LF (`file supabase/seed.sql`) | no "CRLF" | With `autocrlf=true` checked out, `seed:check` reports the seed stale although only line endings differ |
| P2 | `NEXT_TELEMETRY_DISABLED=1` set for builds on Windows | build gets past config | Without it the build dies with `EXDEV ... nextjs-nodejs\Config\config.json` |
| P3 | Nothing listening on :3000 before starting; exactly one server | `server.log` has "Ready", no `EADDRINUSE` | Start a second server: `EADDRINUSE` |
| P4 | Fresh build before any browser check: `rm -rf .next && npm run build` | exit 0 | A server left running across a rebuild serves chunks that no longer exist (500s) and an unstyled page that passes a11y |
| P5 | Every `/_next/static/*` asset referenced by `/` answers 200 | 0 non-200 | Same stale-server case as P4 |
| P6 | No two browser jobs at once; nothing heavy during a timing measurement | — | A concurrent `qa:routes` turned a clean e2e batch into timeouts (13-Sep) |
| P7 | Judge a running `qa:e2e` by its node process and `chrome-headless-shell` CPU, not its log size | — | The report prints only at the end, so a 62-byte log for minutes is normal; it was called "hung" twice |

## S — Static (no server)

| ID | Command | Pass | Control |
|---|---|---|---|
| S1 | `npm run lint` | exit 0 | Add an unused variable |
| S2 | `npm test` | all pass, count not lower than last run (570 on 13-Sep, plus new tests) | Break `splitTaxInclusive` rounding → exactly one test fails (QA.md) |
| S3 | `npm run build` | exit 0, 165 static pages | A type error fails it |
| S4 | `npm run qa:static` | PASS, and every count > 0 (links, sitemap pages, stores, products) | Break `page.tsx` matching → "Found no routes… examined nothing" (floors, `83482fb`) |
| S5 | `npm run placeholders:check` | PASS | Delete one SVG in `public/placeholders` |
| S6 | `npm run seed:check` | PASS | Edit one price in `supabase/seed.sql` |
| S7 | `npm audit` (**not** the `npm ci` summary, which said 0 while audit said 1) | 0 vulnerabilities | — |
| S8 | No secret with a `NEXT_PUBLIC_` prefix; service-role key read only in `src/lib/supabase/admin.ts` | grep finds none | `grep -rn "NEXT_PUBLIC_.*SECRET\|SERVICE_ROLE" src scripts .env.example` |
| S9 | Every `"use server"` file under `src/lib/admin/` calls `getStaffUser()` and returns before touching data when it is null | all guarded | Grep for the guard **name actually used** — `getStaffUser`, not `requireStaff`; grepping the wrong name nearly raised a false alarm (13-Sep) |
| S10 | Service-role client (`supabase/admin`) imported only by the Razorpay routes and `src/lib/notifications/*` | list unchanged | Any new importer must be justified: it bypasses RLS |
| S11 | Documentation claims checked against code, for any claim touched in this change (QA.md Known gaps, `supabase/README.md` store map) | each claim cites a file that says so | QA.md claimed `/admin` was browser-gated for weeks after it wasn't (fixed `0693984`) |

## D — Database

| ID | How | Pass | Control |
|---|---|---|---|
| D1 | `npm run qa:schema` (needs Postgres) | 636 assertions pass | Remove one line from a migration → an assertion fails (repo discipline). **No Postgres on this PC: record as SKIP** |
| D2 | `npm run qa:types` (needs Postgres) | types match migrations | Same — SKIP here |
| D3 | `CI=true npm run qa:schema` with no Postgres | exits 1 "refusing to skip" | This IS the control that CI cannot silently skip D1 |
| D4 | Live: migration list = repo migrations | 34 records, 0001–0030 | — |
| D5 | Live: RLS on every public table, each with ≥ 1 policy | 26/26 | A table with RLS off appears in the security advisors |
| D6 | Live: security advisors | only the 14 known SECURITY-DEFINER WARNs (customer RPCs; `stock_alert_subscribe` is anon by design) | Any new name is a finding, not noise |
| D7 | Live: performance advisors | 49 `unused_index` + `auth_db_connections_absolute`, all INFO | — |
| D8 | `npm run qa:drift -- --live live.json` (needs Postgres) | only the 10 known comment-stripping differences | SKIP here |
| D9 | Every money field `place_retail_order` accepts is re-derived in SQL | all | **Known gap: `p_cod_fee` is not** — open until a migration + test + mutation test lands |

## B — Browser (server running, P3–P5 done)

| ID | Command | Pass | Control |
|---|---|---|---|
| B1 | `npm run qa:routes` | 73 routes (72 + 404 probe), and the count is 73 | `buildRoutes()` throws on an empty tree; before that it printed "All 1 routes passed" |
| B2 | `npm run qa:a11y` | 72 routes, 0 WCAG 2.1 AA violations | Same route list as B1 |
| B3 | Phone widths (inside B1): all routes at 360 and 390 | no sideways scroll | `3fc0d74` control: force an overflow |
| B4 | `npm run qa:e2e` | 0 check failures, 0 console errors | Swap one `appears()` target for a string that never appears → exactly that check fails (`bf75882`) |
| B5 | A crashed flow is reported under its own name | no section named `flow` | Throw on the first line of `fit` → reported under `fit` (`9c39784`) |
| B6 | e2e stability: 3 consecutive B4 runs on a warm server | 3/3 | Record every run, not just the last. The first run after a server start fails more often |
| B7 | `npm run qa:pwa` | manifest, SW, offline fallback | — |

## R — Regression guards for findings (added 13-Sep)

| ID | What | Pass | How |
|---|---|---|---|
| R1 | Signed-out admin RSC navigations over plain http are not upgraded to `https://localhost` | 0 `https://localhost` requests after sign-out | Sign in, clear cookies, click a sidebar link, count requests. Control: with `upgrade-insecure-requests` in the CSP it produced 36 in 3 rounds; with HSTS stripped instead, 28 |
| R2 | A click straight after `goto()` on the product page lands | 0 lost first clicks | 15 fresh loads, click Add to Bag the instant `goto()` returns. Before `clickWhenLive`: 2/15 lost |
| R3 | Admin "Demo mode — saved to this browser only" banner shows only where it is true | *open finding* | `src/components/admin/admin-shell.tsx`, unconditional today |
| R4 | Tables with no reader or writer in `src` | the known 5 only (`wholesale_accounts`, `wholesale_ship_to_addresses`, `retail_addresses`, `reviews`, `wholesale_account_members`) | Grep each table name **and** every `.rpc(` name, including calls split across lines — the first pass missed one and flagged 7 |

---

## Adding a check

Add a row to the right section with the date in its ID note, the exact
command, what passing looks like, and the control. Then run the control once
and record that it failed — before recording that the check passes.
