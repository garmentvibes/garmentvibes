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
| P3a *(13-Sep)* | Count **distinct PIDs** listening on :3000, not netstat lines: `netstat -ano \| grep -E ':3000\s+.*LISTENING' \| awk '{print $NF}' \| sort -u \| wc -l` | 1 | One `next start` binds both `0.0.0.0:3000` and `[::]:3000` — two lines, one PID. Counting lines reports a second server that does not exist |
| P3b *(13-Sep)* | Start the QA server bound to loopback only: `npm run start -- -H 127.0.0.1`. netstat shows only `127.0.0.1:3000`, and this PC's LAN address (`ipconfig`) is refused on :3000 | LAN curl → `000` | A throwaway server bound to `0.0.0.0` on a spare port answers on the LAN address; bound to `127.0.0.1` it is refused. Why: `next start` binds every interface, and this PC's firewall allows `node.exe` inbound on the Public profile — so the QA server, then running Next 16.3.2 with a critical Windows RCE advisory, was reachable from the local network |
| P4 | Fresh build before any browser check: `rm -rf .next && npm run build` | exit 0 | A server left running across a rebuild serves chunks that no longer exist (500s) and an unstyled page that passes a11y |
| P5 | Every `/_next/static/*` asset referenced by `/` answers 200 | 0 non-200 | Same stale-server case as P4 |
| P5a *(14-Sep)* | Extract asset URLs with `grep -oE '/_next/static/[^"\\]+'` — the `\` must be excluded | 17 assets, 0 non-200 (14-Sep) | The page also carries asset URLs inside escaped RSC JSON (`\"`). A pattern that stops only at `"` keeps a trailing `\`, and those 10 "assets" answer **308** — a false P5 failure. Control: request one real asset with `\` appended → 308; without → 200 |
| P6 | No two browser jobs at once; nothing heavy during a timing measurement | — | A concurrent `qa:routes` turned a clean e2e batch into timeouts (13-Sep) |
| P7 | Judge a running `qa:e2e` by its node process and `chrome-headless-shell` CPU, not its log size | — | The report prints only at the end, so a 62-byte log for minutes is normal; it was called "hung" twice |
| P8 *(14-Sep)* | Before a build, check the machine's free **commit** memory, not just free RAM: `(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory` | > 3 GB free | On 14-Sep the build died with `FATAL ERROR: Committing semi space failed … JavaScript heap out of memory` → `Failed to type check.` It was not a type error: 2.7 GB of 23 GB commit was free, held by ~14 open Claude sessions and ~40 MCP helper processes. Read "out of memory" before reading "Failed to type check" — the second is a consequence. Retry with `NODE_OPTIONS=--max-old-space-size=2560`; never close another session's processes |

| P9 *(14-Sep)* | From Git Bash, an environment variable whose value starts with `/` is rewritten into a Windows path before node sees it. Narrow `A11Y_ROUTES` (or anything path-like) with `MSYS_NO_PATHCONV=1`, or set it from PowerShell | `node -e "console.log(process.env.A11Y_ROUTES)"` prints `/admin/…` | `A11Y_ROUTES=/admin/accounts,/admin/promos` arrived as `C:/Program Files/Git/admin/accounts,/admin/promos`: one route silently became a failed navigation, and a control built on it tested nothing. `a11y.mjs` now refuses entries that do not start with `/` |

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
| S7a *(13-Sep)* | After any `npm audit fix` or upgrade, read each changed package's version **from `node_modules/<pkg>/package.json` on disk** | matches `package-lock.json` | On 13-Sep `npm audit` said 0 and `npm ls` said `next@16.3.5` while the file on disk still said **16.3.2** — a critical Windows RCE. Both tools read npm's own records, not the packages. Unit tests and lint then "passed" against the vulnerable code. If disk ≠ lockfile, stop anything holding `node_modules` open and `npm ci` |
| S7b *(13-Sep)* | New advisories arrive between runs — re-run S7 every pass, never carry a result forward | — | `npm audit` was 0 on 07-Sep and 3 (2 high, 1 critical) on 13-Sep with no change to the repo |
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
| B1a *(13-Sep)* | Every console error `qa:routes` reports names the URL it came from | each `console error:` line ends in `[url]` | A 13-Sep failure — `/wholesale — console error: … 404 (Not Found)` — could not be traced: it named no resource. Control: inject a fetch to a missing URL on `/` → the report names that URL |
| B1b *(13-Sep)* | The 404 probe's own "Failed to load resource" is never charged to the route after it | no `[…/this-route-should-not-exist]` on any other route | Routes run in sorted order and `/wholesale` follows the probe, so its late message was reported as a 404 on `/wholesale` (2 runs in a row), which has none. Control: the injected genuine 404 on `/` is still reported — only the probe's own URL is exempt |
| B2 | `npm run qa:a11y` | 72 routes, 0 WCAG 2.1 AA violations | Same route list as B1 |
| B2a *(14-Sep)* | `qa:a11y` also scans every admin route **signed in** (demo staff account), and fails when any route could not be examined | `PASS: 72 routes signed out + 19 of 19 admin routes signed in`; each signed-in line prints the page's own heading, not "Sign in" | Until 14-Sep the sweep never signed in: all 19 admin routes were redirected to `/admin/login` and axe scanned the login form 19 times, so "72 routes, 0 violations" had never looked at a real admin page. Also, a failed navigation was counted but still printed PASS. Control: a copy of the script that clears the session cookies straight after signing in → every admin route reports "still on the login form", 0 scanned signed in, exit 1. **Not** a wrong password: the demo sign-in checks no password, and that first control attempt still reached every page. `[id]` routes take a real id from links the list pages show; one with none says "no real id found" |
| B3 | Phone widths (inside B1): all routes at 360 and 390 | no sideways scroll | `3fc0d74` control: force an overflow |
| B4 | `npm run qa:e2e` | 0 check failures, 0 console errors | Swap one `appears()` target for a string that never appears → exactly that check fails (`bf75882`) |
| B5 | A crashed flow is reported under its own name | no section named `flow` | Throw on the first line of `fit` → reported under `fit` (`9c39784`) |
| B6 | e2e stability: 3 consecutive B4 runs on a warm server | 3/3 | Record every run, not just the last. The first run after a server start fails more often |
| B7 | `npm run qa:pwa` | manifest, SW, offline fallback | — |
| B8 *(13-Sep)* | `qa:e2e` prints `… <flow>` as each flow starts and `<flow> finished in Ns` as it ends | per run: 19 started, 19 finished | Before this, a running suite wrote one 62-byte npm banner for minutes and was twice mistaken for hung (see P7). Count both lines in the log after every run |
| B9 *(13-Sep)* | Every console error in the e2e report is prefixed with the flow that produced it | every `  - ` line starts with `[flow]` | Before, a lone `net::ERR_FAILED [.../_next/static/chunks/1gwj1qyiuryu5.js]` could not be attributed to any of 19 flows |
| B10 *(14-Sep)* | An e2e failure whose console errors start with `net::ERR_INSUFFICIENT_RESOURCES` is the **browser** out of resources, not the app. Before calling it an app bug: (a) `server.log` has no error, (b) fetch the failing page directly and check what the assertion checks, (c) record the run as a failure in B6 anyway — a starved run is not a pass | run counted, cause named | 14-Sep run 2: 2 `seo` checks failed with 2 × `ERR_INSUFFICIENT_RESOURCES` then 12 × `ERR_FAILED` on chunks that answer 200, at 461 MB free RAM. The page fetched directly: 200, AggregateOffer, 189 ≤ 249. Those two checks now print the page status and whether the Product block was found |

## R — Regression guards for findings (added 13-Sep)

| ID | What | Pass | How |
|---|---|---|---|
| R1 | Signed-out admin RSC navigations over plain http are not upgraded to `https://localhost` | 0 `https://localhost` requests after sign-out | Sign in, clear cookies, click a sidebar link, count requests. Control: with `upgrade-insecure-requests` in the CSP it produced 36 in 3 rounds; with HSTS stripped instead, 28 |
| R2 | A click straight after `goto()` on the product page lands | 0 lost first clicks | 15 fresh loads, click Add to Bag the instant `goto()` returns. Before `clickWhenLive`: 2/15 lost |
| R3 | Admin "Demo mode — saved to this browser only" banner shows only where it is true | *fixed 14-Sep* — in B4's `admin` flow: 13 writing pages show exactly one `[data-browser-only-notice]` each, the dashboard 0, and no page shows the old shell banner | Was `src/components/admin/admin-shell.tsx`, unconditional. Control: put the shell banner back and delete the accounts page's notice → exactly those two checks fail. **Configured side not covered** (database-backed pages must show none): needs a Supabase build and real staff sign-in |
| R4 | Tables with no reader or writer in `src` | the known 5 only (`wholesale_accounts`, `wholesale_ship_to_addresses`, `retail_addresses`, `reviews`, `wholesale_account_members`) | Grep each table name **and** every `.rpc(` name, including calls split across lines — the first pass missed one and flagged 7 |
| R5 *(14-Sep)* | Pages no browser suite reaches with real content | *open coverage gap* — `/shop/orders/[id]/invoice` (needs a customer session and a real order) and `/admin/products/wholesale/[id]` (no wholesale link on the default Products tab, so B2a finds no id) | Found when B2a's first real-id run caught a 3.19:1 amber note on the admin tax invoice — the shopper's invoice carried the same note and no check had ever seen it. Fixed by reading the code, not by a check. Close this by giving the sweep a customer session and a wholesale id |

---

## Adding a check

Add a row to the right section with the date in its ID note, the exact
command, what passing looks like, and the control. Then run the control once
and record that it failed — before recording that the check passes.
