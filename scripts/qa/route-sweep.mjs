// Browser-based QA sweep — visits every unique route once (dynamic segments
// filled with real sample values pulled from the mock catalogs), and checks:
//   1. HTTP status is 200 (or 404 for the intentional not-found probe)
//   2. Zero console errors / uncaught page errors
//   3. <title> is present and non-empty
//   4. Basic accessibility: every <img> has alt text, every icon-only
//      button/link has an aria-label, every text <input>/<textarea> has an
//      associated label (via htmlFor, aria-label, or aria-labelledby)
//
// (4) is a smoke check, not the accessibility pass. `npm run qa:a11y` runs
// axe-core over the same routes against WCAG 2.1 AA — around ninety rules,
// including everything here and a great deal more. These four stay because
// they cost nothing, need no dependency, and run in a sweep that was already
// visiting every page. Where the two overlap axe is the stricter of them: it
// rejects a `placeholder` as an input's only label, and this does not.
//
// Requires a running server — start `npm run dev` (or `npm run build &&
// npm run start`) first, then: node scripts/qa/route-sweep.mjs
// Override the target with BASE_URL=https://your-preview-url ... node ...

import { launchBrowser } from "./_launch-browser.mjs";
import { goto } from "./_goto.mjs";
import { buildRoutes } from "./_routes.mjs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// The route list is shared with the accessibility sweep — see _routes.mjs.
// The 404 probe below is this sweep's own: it asserts that a URL the app does
// not have answers 404, which is not a page anybody renders.
const routes = new Set(buildRoutes());
routes.add("/this-route-should-not-exist"); // 404 probe

let failures = 0;
function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}

// page.goto() takes a timeout, but page.title() and page.evaluate() do not —
// they wait forever on a page whose main thread is wedged (an infinite render
// loop, say). That would turn a bad page into a silent hang rather than a
// failure. Bound them explicitly so the sweep always terminates and names the
// route that stalled.
class StepTimeout extends Error {}
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new StepTimeout(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
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
  await goto(page, BASE_URL, { timeout: 60000 });
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
    response = await goto(page, `${BASE_URL}${route}`, { timeout: 20000 });
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
    try {
      const title = await withTimeout(page.title(), 15000, "page.title()");
      if (!title || title.trim() === "") fail(`${route} — missing <title>`);

      const a11y = await withTimeout(
        page.evaluate(() => {
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
        }),
        20000,
        "a11y page.evaluate()"
      );
      for (const issue of a11y) fail(`${route} — a11y: ${issue}`);
    } catch (e) {
      if (e instanceof StepTimeout) {
        // The page loaded but its main thread never became responsive —
        // usually an infinite render loop. Name the route and keep going.
        fail(`${route} — page became unresponsive: ${e.message}`);
      } else {
        throw e;
      }
    }
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

// ---------------------------------------------------------------------------
// Horizontal overflow at tablet widths.
//
// The sweep above runs at 1280x900, and that is exactly why this was missed:
// both mega-menu dropdowns were `invisible` rather than `hidden`, so their
// ~720px and ~980px panels stayed in the layout and pushed the document wider
// than the viewport on anything narrower than a desktop. Every retail page
// scrolled sideways on an iPad in portrait, with nothing visible to explain
// why — the offending element was, by definition, invisible.
//
// A page that scrolls sideways has no single failing element to assert on, so
// the check is the symptom itself: scrollWidth must not exceed clientWidth.
// ---------------------------------------------------------------------------

const TABLET_VIEWPORTS = [
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
];

// A representative page from each area rather than all 70-odd: overflow comes
// from shared chrome (header, nav, footer), so one page per layout catches it
// without tripling the sweep's runtime.
const OVERFLOW_ROUTES = [
  "/",
  "/shop",
  "/shop/cart",
  "/shop/product/classic-crew-neck-tee",
  "/wholesale",
  "/wholesale/catalog",
];

for (const viewport of TABLET_VIEWPORTS) {
  const tabletPage = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });

  for (const route of OVERFLOW_ROUTES) {
    try {
      await goto(tabletPage, `${BASE_URL}${route}`);
      const overflow = await tabletPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      if (overflow > 0) {
        fail(`${route} — scrolls sideways at ${viewport.name} (${viewport.width}px) by ${overflow}px`);
      }
    } catch (e) {
      fail(`${route} — could not measure overflow at ${viewport.name}: ${e.message}`);
    }
  }

  await tabletPage.close();
}

if (failures === 0) {
  pass(
    `No horizontal overflow on ${OVERFLOW_ROUTES.length} pages at ${TABLET_VIEWPORTS.length} tablet widths`
  );
}

await browser.close();

if (failures === 0) pass(`All ${checked} routes passed (status, console, title, basic a11y)`);
console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} issue(s) across ${checked} routes`);
process.exit(failures === 0 ? 0 : 1);
