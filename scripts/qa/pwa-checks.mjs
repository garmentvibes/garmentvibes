// PWA QA — verifies the installable/offline behaviour actually works rather
// than just that the files exist:
//   1. manifest.webmanifest is served, parses, and has the fields a browser
//      requires to consider the app installable
//   2. sw.js is served with no-cache headers (a pinned stale SW is a classic
//      PWA footgun)
//   3. the service worker registers and reaches "activated"
//   4. with the network forced offline, a navigation still renders the
//      offline fallback page instead of the browser's error page
//
// Requires a running server (production build recommended, since the SW
// caches /_next/static paths):
//   npm run build && npm run start
//   node scripts/qa/pwa-checks.mjs

import { launchBrowser } from "./_launch-browser.mjs";
import { goto } from "./_goto.mjs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

let failures = 0;
function fail(msg) {
  console.error(`✗ ${msg}`);
  failures++;
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

// --- 1. Manifest ------------------------------------------------------------
const manifestRes = await fetch(`${BASE_URL}/manifest.webmanifest`);
if (!manifestRes.ok) {
  fail(`manifest.webmanifest returned HTTP ${manifestRes.status}`);
} else {
  const manifest = await manifestRes.json();
  const required = ["name", "short_name", "start_url", "display", "icons"];
  const missing = required.filter((k) => !manifest[k]);
  if (missing.length) fail(`manifest missing required field(s): ${missing.join(", ")}`);

  const sizes = (manifest.icons ?? []).map((i) => i.sizes);
  for (const needed of ["192x192", "512x512"]) {
    if (!sizes.includes(needed)) fail(`manifest has no ${needed} icon`);
  }
  if (!(manifest.icons ?? []).some((i) => i.purpose?.includes("maskable"))) {
    fail("manifest has no maskable icon (Android adaptive icons will letterbox)");
  }
  if (missing.length === 0) pass("manifest.webmanifest is valid and installable");
}

// --- 2. Service worker headers ---------------------------------------------
const swRes = await fetch(`${BASE_URL}/sw.js`);
if (!swRes.ok) {
  fail(`sw.js returned HTTP ${swRes.status}`);
} else {
  const cacheControl = swRes.headers.get("cache-control") ?? "";
  if (!/no-cache|no-store|max-age=0/.test(cacheControl)) {
    fail(`sw.js should not be cacheable, got Cache-Control: "${cacheControl}"`);
  } else {
    pass("sw.js is served with no-cache headers");
  }
}

// --- 3 & 4. Registration + offline fallback ---------------------------------
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

await goto(page, BASE_URL);

// `serviceWorker.ready` resolves as soon as a registration has an active
// worker, which can still be in the "activating" state. Wait for it to
// actually reach "activated" rather than sampling the state once — the
// previous code only passed because networkidle happened to burn enough
// time first.
const swState = await page.evaluate(async () => {
  if (!("serviceWorker" in navigator)) return "unsupported";
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return "not-ready";
  const worker = reg.active;
  if (!worker) return "no-active-worker";
  if (worker.state === "activated") return "activated";

  return await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(worker.state), 10000);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") {
        clearTimeout(timer);
        resolve("activated");
      }
    });
  });
});

if (swState !== "activated") {
  fail(`service worker did not activate (state: ${swState})`);
} else {
  pass("service worker registers and activates");

  // Give the SW a beat to finish precaching before cutting the network.
  await page.waitForTimeout(1000);
  await context.setOffline(true);

  try {
    await page.goto(`${BASE_URL}/shop`, { waitUntil: "domcontentloaded", timeout: 15000 });
    const body = await page.textContent("body");
    if (body && body.includes("offline")) {
      pass("offline navigation falls back to the offline page");
    } else {
      fail("offline navigation did not render the offline fallback page");
    }
  } catch (e) {
    fail(`offline navigation failed outright: ${e.message.slice(0, 120)}`);
  } finally {
    await context.setOffline(false);
  }
}

await browser.close();

console.log(`\n${failures === 0 ? "PASS" : "FAIL"}: ${failures} issue(s)`);
process.exit(failures === 0 ? 0 : 1);
