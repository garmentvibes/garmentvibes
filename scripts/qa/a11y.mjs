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

import { readFileSync } from "fs";
import { createRequire } from "module";
import { launchBrowser } from "./_launch-browser.mjs";
import { goto } from "./_goto.mjs";
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

const routes = only.length > 0 ? only : buildRoutes();

/** Violations grouped by rule, so one CSS mistake reads as one finding. */
const byRule = new Map();
let failures = 0;
let checked = 0;

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
    failures += 1;
    continue;
  }

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
    entry.routes.add(route);
    for (const node of violation.nodes.slice(0, 2)) {
      if (entry.samples.length < 4) {
        entry.samples.push({
          route,
          target: node.target.join(" "),
          // The one line that says what is actually wrong with this element.
          summary: (node.failureSummary ?? "").split("\n").slice(0, 3).join(" ").trim(),
        });
      }
    }
    byRule.set(violation.id, entry);
    failures += 1;
  }

  checked += 1;
  // Printed per route, with how long it took. A sweep of seventy-odd routes
  // reports only at the end, so without this a slow page is indistinguishable
  // from a hang — which is exactly how it was first misread. The duration is
  // what tells the two apart.
  process.stdout.write(
    `  ${String(checked).padStart(2)}/${routes.length} ${route} (${Date.now() - startedAt}ms)\n`
  );
}

await browser.close();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

const rules = [...byRule.entries()].sort(
  (a, b) => (IMPACT_ORDER[a[1].impact] ?? 9) - (IMPACT_ORDER[b[1].impact] ?? 9)
);

if (rules.length === 0) {
  console.log(`\nPASS: ${checked} routes, no WCAG 2.1 AA violations.`);
  process.exit(0);
}

console.log(`\n${rules.length} rule(s) violated across ${checked} routes:\n`);

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

console.log(`FAIL: ${failures} violation(s) across ${rules.length} rule(s).`);
process.exit(1);
