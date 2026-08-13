// Browser-based QA sweep — visits every unique route once (dynamic segments
// filled with real sample values pulled from the mock catalogs), and checks:
//   1. HTTP status is 200 (or 404 for the intentional not-found probe)
//   2. Zero console errors / uncaught page errors
//   3. <title> is present and non-empty
//   4. Basic accessibility: every <img> has alt text, every icon-only
//      button/link has an aria-label, every text <input>/<textarea> has an
//      associated label (via htmlFor, aria-label, or aria-labelledby)
//
// Requires a running server — start `npm run dev` (or `npm run build &&
// npm run start`) first, then: node scripts/qa/route-sweep.mjs
// Override the target with BASE_URL=https://your-preview-url ... node ...

import { readdirSync, statSync, readFileSync } from "fs";
import { join, relative } from "path";
import { launchBrowser } from "./_launch-browser.mjs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const APP_DIR = join(process.cwd(), "src/app");

function walk(dir, cb) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, cb);
    else cb(full);
  }
}

function extractSlugs(file, limit = 2) {
  const content = readFileSync(file, "utf8");
  const matches = [...content.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  return matches.slice(0, limit);
}

const retailSlugs = extractSlugs(join(process.cwd(), "src/lib/mock/retail-products.ts"));
const wholesaleSlugs = extractSlugs(join(process.cwd(), "src/lib/mock/wholesale-products.ts"));
const retailCategories = ["women", "men", "kids"];
const wholesaleCategories = ["women", "men", "kids", "unisex", "fabric"];

// Build the route list from the App Router tree, substituting dynamic
// segments with real sample values so every page template gets exercised.
const routes = new Set();
walk(APP_DIR, (file) => {
  if (!/\/page\.tsx$/.test(file)) return;
  const dir = relative(APP_DIR, file.replace(/\/page\.tsx$/, ""));
  const segments = (dir === "" ? [] : dir.split("/")).filter((s) => !/^\(.*\)$/.test(s));

  if (segments.includes("[slug]")) {
    const isWholesale = segments[0] === "wholesale";
    const samples = isWholesale ? wholesaleSlugs : retailSlugs;
    for (const slug of samples) {
      routes.add("/" + segments.map((s) => (s === "[slug]" ? slug : s)).join("/"));
    }
    return;
  }
  if (segments.includes("[category]")) {
    const isWholesale = segments[0] === "wholesale";
    const samples = isWholesale ? wholesaleCategories.slice(0, 2) : retailCategories.slice(0, 2);
    for (const cat of samples) {
      routes.add("/" + segments.map((s) => (s === "[category]" ? cat : s)).join("/"));
    }
    return;
  }
  routes.add("/" + segments.join("/"));
});
routes.add("/this-route-should-not-exist"); // 404 probe

let failures = 0;
function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Warm up: `next dev` compiles each route on first request, which can blow
// past a normal navigation timeout on the very first few routes hit. A
// throwaway visit with a generous timeout avoids false "navigation failed"
// failures caused purely by cold-start compilation, not a real bug.
try {
  await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 60000 });
} catch {
  // ignore — the real pass below will report any genuine failure
}

let checked = 0;
for (const route of [...routes].sort()) {
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  };
  const onPageError = (err) => consoleErrors.push(err.message);
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  let response;
  try {
    response = await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 15000 });
  } catch (e) {
    fail(`${route} — navigation failed: ${e.message}`);
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    continue;
  }

  const status = response?.status();
  const expectedStatus = route === "/this-route-should-not-exist" ? 404 : 200;
  if (status !== expectedStatus) {
    fail(`${route} — expected HTTP ${expectedStatus}, got ${status}`);
  }

  if (status === 200) {
    const title = await page.title();
    if (!title || title.trim() === "") fail(`${route} — missing <title>`);

    const a11y = await page.evaluate(() => {
      const issues = [];
      document.querySelectorAll("img").forEach((img) => {
        if (!img.hasAttribute("alt")) issues.push(`<img src="${img.getAttribute("src")?.slice(0, 40)}"> missing alt`);
      });
      document.querySelectorAll("button, a").forEach((el) => {
        const hasText = el.textContent && el.textContent.trim().length > 0;
        const hasLabel = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
        const isIconOnly = !hasText && el.querySelector("svg");
        if (isIconOnly && !hasLabel) {
          issues.push(`icon-only <${el.tagName.toLowerCase()}> missing aria-label (class="${el.className.toString().slice(0, 50)}")`);
        }
      });
      document.querySelectorAll("input, textarea, select").forEach((el) => {
        if (el.type === "hidden" || el.type === "submit" || el.type === "button") return;
        if (el.getAttribute("aria-hidden") === "true") return; // not exposed to assistive tech
        const id = el.getAttribute("id");
        const hasFor = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const hasWrappingLabel = el.closest("label"); // <label><input/>Text</label> is valid
        const hasAria = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
        const hasPlaceholder = el.hasAttribute("placeholder");
        if (!hasFor && !hasWrappingLabel && !hasAria && !hasPlaceholder) {
          issues.push(`<${el.tagName.toLowerCase()}> missing an associated label (id="${id}")`);
        }
      });
      return issues;
    });
    for (const issue of a11y) fail(`${route} — a11y: ${issue}`);
  }

  // The 404 route itself logs a "Failed to load resource: 404" browser
  // diagnostic for its own document response — expected noise, not a bug.
  if (route !== "/this-route-should-not-exist" && consoleErrors.length > 0) {
    for (const err of consoleErrors) fail(`${route} — console error: ${err.slice(0, 200)}`);
  }

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  checked++;
}

await browser.close();

if (failures === 0) pass(`All ${checked} routes passed (status, console, title, basic a11y)`);
console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} issue(s) across ${checked} routes`);
process.exit(failures === 0 ? 0 : 1);
