// Static QA checks — no server or browser required.
// 1. Internal link integrity: every href="/..." found in source must resolve
//    against the actual App Router route tree (accounting for route groups
//    and dynamic segments).
// 2. Placeholder/debug leftovers: TODO/FIXME/Lorem ipsum/stray console.log.
//
// Usage: node scripts/qa/static-checks.mjs

import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, "src/app");
const SRC_DIR = join(ROOT, "src");

let failures = 0;
function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. Build the known route tree from src/app
// ---------------------------------------------------------------------------

function walk(dir, cb) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

const routePatterns = []; // regexes matching valid pathnames

walk(APP_DIR, (file) => {
  if (!/\/page\.tsx$/.test(file)) return;
  const dir = relative(APP_DIR, file.replace(/\/page\.tsx$/, ""));
  const segments = dir === "" ? [] : dir.split("/");
  const kept = segments.filter((s) => !/^\(.*\)$/.test(s)); // drop route groups
  const regexParts = kept.map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const pattern = "^/" + regexParts.join("/") + "$";
  routePatterns.push(new RegExp(pattern === "^/$" ? "^/$" : pattern));
});

function isKnownRoute(pathname) {
  return routePatterns.some((re) => re.test(pathname));
}

// ---------------------------------------------------------------------------
// 2. Extract internal hrefs from source and cross-check
// ---------------------------------------------------------------------------

const foundLinks = new Map(); // pathname -> [files]

walk(SRC_DIR, (file) => {
  if (!/\.(tsx|ts)$/.test(file)) return;
  const content = readFileSync(file, "utf8");
  // Fresh regex instance per file — reusing one `g`-flagged regex across
  // exec() calls on different strings leaves `lastIndex` pointing past the
  // end of the next (possibly shorter) file, silently skipping its matches.
  // Matches both JSX attributes (href="...", href={`...`}) and object-literal
  // properties (href: "...") used for data-driven nav/footer link lists.
  const hrefRegex = /href[=:]\s*(?:\{`([^`]+)`\}|"([^"]+)"|'([^']+)'|\{"([^"]+)"\})/g;
  let match;
  while ((match = hrefRegex.exec(content))) {
    let href = match[1] || match[2] || match[3] || match[4];
    if (!href.startsWith("/")) continue; // skip external, mailto:, tel:, #anchors
    // Strip query string / template interpolation tail, keep static prefix
    const staticPrefix = href.split(/[?${]/)[0].replace(/\/$/, "") || "/";
    const rel = relative(ROOT, file);
    if (!foundLinks.has(staticPrefix)) foundLinks.set(staticPrefix, []);
    foundLinks.get(staticPrefix).push(rel);
  }
});

let brokenLinks = 0;
for (const [href, files] of foundLinks) {
  // Template-interpolated hrefs (e.g. `/shop/product/${slug}`) become a
  // static prefix like "/shop/product" after stripping — accept it if it
  // resolves once one more dynamic segment is appended (i.e. the prefix is
  // itself a valid route, or prefix + "/x" matches a [param] route).
  const matches = isKnownRoute(href) || isKnownRoute(`${href}/__qa_dynamic_segment__`);
  if (!matches) {
    fail(`Broken internal link "${href}" referenced in ${[...new Set(files)].join(", ")}`);
    brokenLinks++;
  }
}
if (brokenLinks === 0) pass(`All internal links resolve to known routes (${foundLinks.size} unique hrefs checked)`);

// ---------------------------------------------------------------------------
// 3. Placeholder / debug leftovers
// ---------------------------------------------------------------------------

const suspiciousPatterns = [
  { re: /\bTODO\b/, label: "TODO left in source" },
  { re: /\bFIXME\b/, label: "FIXME left in source" },
  { re: /Lorem ipsum/i, label: "Lorem ipsum placeholder text" },
  { re: /console\.log\(/, label: "stray console.log(" },
];

let leftovers = 0;
walk(SRC_DIR, (file) => {
  if (!/\.(tsx|ts)$/.test(file)) return;
  const content = readFileSync(file, "utf8");
  const rel = relative(ROOT, file);
  for (const { re, label } of suspiciousPatterns) {
    if (re.test(content)) {
      fail(`${label} in ${rel}`);
      leftovers++;
    }
  }
});
if (leftovers === 0) pass("No TODO/FIXME/Lorem ipsum/console.log leftovers found");

// ---------------------------------------------------------------------------
// 4. Sitemap coverage
//
// A public page missing from the sitemap is invisible to this suite
// otherwise: every route still renders, every link still resolves, so
// nothing fails — it just quietly never gets crawled. That is how the
// Refund Policy and Grievance pages, which Razorpay reads during merchant
// onboarding, went unlisted for weeks.
//
// Anything genuinely private must be disallowed in robots.txt, so that file
// is the source of truth for what may be excluded rather than a second list
// maintained here.
// ---------------------------------------------------------------------------

const sitemapSource = readFileSync(join(APP_DIR, "sitemap.ts"), "utf8");
const robotsSource = readFileSync(join(APP_DIR, "robots.ts"), "utf8");

// Paths robots.txt tells crawlers to stay out of.
const disallowed = [...robotsSource.matchAll(/"(\/[^"]*)"/g)]
  .map((m) => m[1])
  .filter((p) => p !== "/");

// Static public pages in the app tree: no dynamic segments, not an API
// route, and not one of the utility pages that should never be indexed.
const NEVER_INDEXED = ["/offline", "/admin"];
const staticPublicRoutes = [];
walk(APP_DIR, (file) => {
  if (!/\/page\.tsx$/.test(file)) return;
  const dir = relative(APP_DIR, file.replace(/\/page\.tsx$/, ""));
  const segments = (dir === "" ? [] : dir.split("/")).filter((s) => !/^\(.*\)$/.test(s));
  if (segments.some((s) => s.startsWith("["))) return; // dynamic, covered separately
  const route = "/" + segments.join("/");
  if (route === "/") return; // the root is added explicitly
  if (NEVER_INDEXED.some((p) => route.startsWith(p))) return;
  if (disallowed.some((p) => route === p || route.startsWith(`${p}/`))) return;
  staticPublicRoutes.push(route);
});

let uncovered = 0;
for (const route of staticPublicRoutes) {
  if (!sitemapSource.includes(`"${route}"`)) {
    fail(`${route} is publicly reachable but missing from sitemap.ts`);
    uncovered++;
  }
}
if (uncovered === 0) {
  pass(`All ${staticPublicRoutes.length} public static pages are in the sitemap`);
}

// ---------------------------------------------------------------------------
// Every persisted store must be rehydrated by StoreHydrator.
//
// Stores use `skipHydration: true` so the first client render matches the SSR
// output, which means something has to call rehydrate() after mount. A store
// that nobody rehydrates works perfectly in the session that wrote it and is
// empty on return — invisible in review, invisible in a fresh-page test, and
// discovered by a customer whose saved data has vanished.
//
// This was not hypothetical: the fit-feedback store shipped without its line
// in StoreHydrator and the only reason it was caught was an e2e check that
// happened to reload the page.
// ---------------------------------------------------------------------------

const STORES_DIR = join(SRC_DIR, "lib/stores");
const hydratorSource = readFileSync(
  join(SRC_DIR, "components/shared/store-hydrator.tsx"),
  "utf8"
);

let unhydrated = 0;
let persistedStores = 0;

for (const file of readdirSync(STORES_DIR)) {
  if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;

  const source = readFileSync(join(STORES_DIR, file), "utf8");
  if (!source.includes("skipHydration")) continue;
  persistedStores++;

  // The exported hook name, e.g. `export const useCartStore = create<...`.
  const match = source.match(/export const (use\w+Store)\s*=/);
  if (!match) {
    fail(`${file} persists state but exports no use*Store hook to rehydrate`);
    unhydrated++;
    continue;
  }

  const hook = match[1];
  if (!hydratorSource.includes(`${hook}.persist.rehydrate()`)) {
    fail(
      `${hook} (${file}) uses skipHydration but StoreHydrator never rehydrates it — ` +
        "its persisted state will be silently dropped on every page load"
    );
    unhydrated++;
  }
}

if (unhydrated === 0) {
  pass(`All ${persistedStores} persisted stores are rehydrated by StoreHydrator`);
}

// ---------------------------------------------------------------------------

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} issue(s) found`);
process.exit(failures === 0 ? 0 : 1);
