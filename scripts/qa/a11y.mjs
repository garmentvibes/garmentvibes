// The accessibility pass — axe-core over every route, against WCAG 2.1 AA.
//
// ---------------------------------------------------------------------------
// Why this and not the check that already existed
// ---------------------------------------------------------------------------
//
// route-sweep.mjs has hand-written checks for four things: an alt on every
// image, an aria-label on every icon-only control, a label on every input, and
// a non-empty title. Those were worth having and they caught real bugs, but
// four rules written from memory is not an accessibility pass. axe-core runs
// about ninety, and the ones this project could not have known it was failing
// are the ones nobody writes by hand: colour contrast, heading order, landmark
// structure, ARIA attribute validity, duplicated ids, list nesting.
//
// Both are kept. The smoke check costs nothing and runs in a sweep that was
// already visiting every page; this is the thorough one. Where they overlap
// axe is stricter, so satisfying axe satisfies both.
//
// ---------------------------------------------------------------------------
// Which rules, and why not all of them
// ---------------------------------------------------------------------------
//
// The four WCAG tags — wcag2a, wcag2aa, wcag21a, wcag21aa — and nothing else.
// axe also ships `best-practice` rules, which are real advice but not a
// standard: they include things like "every page should have one main landmark"
// alongside opinions about how regions should be organised, and mixing them in
// would mean a failing build could not be pointed at a clause anybody has
// agreed to. AA is the level the Indian Rights of Persons with Disabilities
// Act's accessibility standard and the EU/US procurement rules all converge
// on, so it is the line worth holding.
//
// `experimental` is off for the same reason, and axe's own advice.
//
// ---------------------------------------------------------------------------
// No baseline file
// ---------------------------------------------------------------------------
//
// Deliberately. A baseline turns a list of things that are wrong into a list
// of things that are allowed to be wrong, and the second list never shrinks —
// it is read as configuration by everyone who arrives afterwards. Every
// violation this found was fixed instead, so the honest state of the build is
// zero and the check can fail loudly on the next one.
//
// ---------------------------------------------------------------------------
// The admin panel is scanned twice (14-Sep)
// ---------------------------------------------------------------------------
//
// The first pass is signed out, so every /admin route is redirected by the
// proxy to /admin/login, and axe checks the login form about nineteen times
// over. Until 14-Sep that was the only pass: the panel's own pages had never
// been checked at all, and "72 routes, no violations" included them. The
// first signed-in run found a contrast failure on every one of them. The
// second pass signs in with the demo staff account (CI's ALLOW_DEMO_ADMIN=1)
// and scans each admin page again. A page that still lands on the login form
// fails by name rather than passing as the login form.

import { readFileSync } from "fs";
import { createRequire } from "module";
import { launchBrowser } from "./_launch-browser.mjs";
import { goto, appears } from "./_goto.mjs";
import { buildRoutes } from "./_routes.mjs";

const require = createRequire(import.meta.url);
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Read off disk and injected as a plain script rather than imported: axe is
// built to run inside the page, against a real layout and real computed
// styles. Colour contrast in particular cannot be decided from the outside —
// it needs the browser's own idea of what colour a pixel ended up.
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

// A full sweep is every route, which is what CI runs. `A11Y_ROUTES` narrows it
// to a comma-separated list for working on one page — a full pass takes
// minutes, and re-running it to check a one-line CSS change is how a useful
// check becomes one nobody runs.
const only = (process.env.A11Y_ROUTES ?? "")
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

// Every route is a path. Git Bash rewrites a value that looks like a POSIX
// path into a Windows one before node sees it, so a narrowed run from there
// can quietly ask for "C:/Program Files/Git/admin/…" — refuse, rather than
// report it as one more route that failed to load.
const notPaths = only.filter((r) => !r.startsWith("/"));
if (notPaths.length > 0) {
  console.error(
    `A11Y_ROUTES entries must start with "/": ${notPaths.join(", ")}\n` +
      "From Git Bash, prefix the command with MSYS_NO_PATHCONV=1, or set it from PowerShell."
  );
  process.exit(1);
}

const routes = only.length > 0 ? only : buildRoutes();

// The demo staff account the e2e suite signs in with. It works only where the
// server runs with ALLOW_DEMO_ADMIN=1 and no Supabase project — CI and QA —
// and that sign-in checks no password at all, so a wrong password is not a
// way to make it fail.
const ADMIN_EMAIL = "staff@garmentvibes.com";
const ADMIN_PASSWORD = "password123";

/** Violations grouped by rule, so one CSS mistake reads as one finding. */
const byRule = new Map();
let failures = 0;
let checked = 0;
// Routes that could not be examined at all. Kept apart from `failures` because
// a route nobody looked at is not a pass, and used to print as one: a failed
// navigation was counted but the report only failed on rule violations.
let unchecked = 0;

/** Runs axe on whatever the page is showing, and files violations under `label`. */
async function scan(page, label) {
  await page.addScriptTag({ content: AXE_SOURCE });

  const results = await page.evaluate(
    async (tags) =>
      // `axe` is injected into the page above, so it exists at run time but
      // not at lint time. Referenced through globalThis rather than silenced
      // with a disable comment: eslint reports the comment itself as unused,
      // which is a warning about a workaround for a warning.
      await globalThis.axe.run(document, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations"],
      }),
    TAGS
  );

  for (const violation of results.violations) {
    const entry = byRule.get(violation.id) ?? {
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      routes: new Set(),
      samples: [],
    };
    entry.routes.add(label);
    for (const node of violation.nodes.slice(0, 2)) {
      if (entry.samples.length < 4) {
        entry.samples.push({
          route: label,
          target: node.target.join(" "),
          // The one line that says what is actually wrong with this element.
          summary: (node.failureSummary ?? "").split("\n").slice(0, 3).join(" ").trim(),
        });
      }
    }
    byRule.set(violation.id, entry);
    failures += 1;
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// As in the route sweep: `next dev` compiles a route on first request, and a
// cold start can blow past a normal navigation timeout.
try {
  await goto(page, BASE_URL, { timeout: 60000 });
} catch {
  // The real pass below reports anything genuine.
}

for (const route of routes) {
  const startedAt = Date.now();
  // `goto` already waits for the hydration flag StoreHydrator sets, which is
  // what makes axe see the page a customer sees rather than its pre-hydration
  // shell. An earlier version of this file waited for it a second time, which
  // doubled the cost of every route that never sets it — and around twenty
  // here do not, because the admin section redirects to a login outside the
  // storefront layout. Two fifteen-second waits on twenty routes is ten
  // minutes of waiting for something that was never coming, which is why this
  // sweep first looked like a hang.
  //
  // Three seconds rather than the default fifteen: the flag is set in a mount
  // effect, so a page that has not set it a moment after load never will.
  try {
    await goto(page, `${BASE_URL}${route}`, { timeout: 20000, hydrationTimeout: 3000 });
  } catch (e) {
    console.error(`✗ ${route} — navigation failed: ${e.message}`);
    unchecked += 1;
    continue;
  }

  await scan(page, route);

  checked += 1;
  // Printed per route, with how long it took. A sweep of seventy-odd routes
  // reports only at the end, so without this a slow page is indistinguishable
  // from a hang — which is exactly how it was first misread. The duration is
  // what tells the two apart.
  process.stdout.write(
    `  ${String(checked).padStart(2)}/${routes.length} ${route} (${Date.now() - startedAt}ms)\n`
  );
}

// ---------------------------------------------------------------------------
// Second pass: the admin panel, signed in
// ---------------------------------------------------------------------------

const adminRoutes = routes.filter((r) => r.startsWith("/admin") && r !== "/admin/login");
let adminChecked = 0;
let literalIds = 0;

// Real ids for the `[id]` routes, taken from the links the signed-in pages
// themselves show. Routes run in sorted order, so /admin/orders is scanned
// before /admin/orders/[id] and its links are already collected here. Visited
// literally, `/admin/orders/[id]` only ever shows a "not found" state.
const seenAdminLinks = new Set();

function resolveId(route) {
  if (!route.includes("[id]")) return route;
  // Route segments are letters, digits and hyphens, so nothing needs escaping.
  const pattern = new RegExp("^" + route.split("[id]").join("(?!new(?:/|$))[^/?#]+") + "$");
  for (const href of seenAdminLinks) {
    if (pattern.test(href)) return href;
  }
  return route;
}

if (adminRoutes.length > 0) {
  let signedIn = false;
  try {
    await goto(page, `${BASE_URL}/admin/login`, { timeout: 20000, hydrationTimeout: 3000 });
    await page.fill("#email", ADMIN_EMAIL);
    await page.fill("#password", ADMIN_PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin", { timeout: 20000 });
    signedIn = true;
  } catch (e) {
    console.error(`✗ admin sign-in failed, so no admin page can be scanned signed in: ${e.message}`);
  }

  for (const route of adminRoutes) {
    const startedAt = Date.now();
    const target = resolveId(route);
    const label = target === route ? `${route} [signed in]` : `${route} → ${target} [signed in]`;
    if (!signedIn) {
      unchecked += 1;
      continue;
    }
    try {
      await goto(page, `${BASE_URL}${target}`, { timeout: 20000 });
    } catch (e) {
      console.error(`✗ ${label} — navigation failed: ${e.message}`);
      unchecked += 1;
      continue;
    }
    // The admin pages are client components that render after mount, so wait
    // for a heading rather than scanning an empty shell — which would pass.
    await appears(page, "main h1");
    if (new URL(page.url()).pathname === "/admin/login") {
      console.error(`✗ ${label} — still on the login form, so the page itself was never seen`);
      unchecked += 1;
      continue;
    }

    await scan(page, label);

    const hrefs = await page
      .$$eval('a[href^="/admin/"]', (links) => links.map((a) => a.getAttribute("href")))
      .catch(() => []);
    for (const href of hrefs) if (href) seenAdminLinks.add(href);

    adminChecked += 1;
    if (target.includes("[id]")) literalIds += 1;
    // A capped read: textContent() otherwise waits thirty seconds for a
    // heading that is not there, which is what the "not found" states cost.
    const heading = ((await page.locator("main h1").first().textContent({ timeout: 1000 }).catch(() => "")) ?? "").trim();
    const note = target.includes("[id]") ? ' — no real id found, so this is the "not found" state' : "";
    process.stdout.write(
      `  ${String(adminChecked).padStart(2)}/${adminRoutes.length} ${label} "${heading}" (${Date.now() - startedAt}ms)${note}\n`
    );
  }
}

await browser.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

const rules = [...byRule.entries()].sort(
  (a, b) => (IMPACT_ORDER[a[1].impact] ?? 9) - (IMPACT_ORDER[b[1].impact] ?? 9)
);

const scope =
  adminRoutes.length > 0
    ? `${checked} routes signed out + ${adminChecked} of ${adminRoutes.length} admin routes signed in` +
      (literalIds > 0 ? ` (${literalIds} with no real id)` : "")
    : `${checked} routes`;

if (rules.length === 0 && unchecked === 0) {
  console.log(`\nPASS: ${scope}, no WCAG 2.1 AA violations.`);
  process.exit(0);
}

if (rules.length > 0) {
  console.log(`\n${rules.length} rule(s) violated across ${scope}:\n`);
}

for (const [id, entry] of rules) {
  const routes = [...entry.routes];
  console.log(`✗ ${id} (${entry.impact}) — ${entry.help}`);
  console.log(`  ${routes.length} route(s): ${routes.slice(0, 6).join(", ")}${routes.length > 6 ? ` … +${routes.length - 6}` : ""}`);
  for (const sample of entry.samples) {
    console.log(`    ${sample.target}`);
    if (sample.summary) console.log(`      ${sample.summary}`);
  }
  console.log(`  ${entry.helpUrl}`);
  console.log("");
}

console.log(
  `FAIL: ${failures} violation(s) across ${rules.length} rule(s); ${unchecked} route(s) could not be examined (${scope}).`
);
process.exit(1);
