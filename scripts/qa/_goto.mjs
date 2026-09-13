// Shared navigation helper for the QA suites.
//
// These scripts used `waitUntil: "networkidle"` to know a page was ready.
// That stopped working when Next started prefetching linked routes in the
// background: the mega-menu alone keeps RSC requests open indefinitely, so
// the network is never idle and every navigation times out.
//
// `networkidle` was the wrong signal even before that — Playwright
// discourages it precisely because it guesses at readiness from network
// traffic. What these checks actually need is "React has hydrated and the
// persisted stores are live", which StoreHydrator now announces by setting
// data-hydrated on <html>. Waiting on that is both faster and more truthful.

const HYDRATION_TIMEOUT = 15000;

/**
 * Navigates and waits until the app is hydrated.
 *
 * Returns the navigation response so callers can still assert on status.
 * Pages that never hydrate (a 404 probe served without the app shell, say)
 * fall through after the timeout rather than failing the run — the caller's
 * own assertions decide whether that's a problem.
 */
export async function goto(page, url, options = {}) {
  const response = await page.goto(url, { waitUntil: "load", ...options });
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.hydrated === "true",
      // `undefined` is the argument passed INTO the page function, and the
      // options go third. Playwright's signature is
      // `waitForFunction(pageFunction, arg, options)`, and this used to call
      // it with two arguments — so the `{ timeout }` object was handed to the
      // predicate as its argument and silently ignored, leaving Playwright's
      // own 30-second default in force.
      //
      // HYDRATION_TIMEOUT had therefore never applied. Every page that does
      // not hydrate — the admin login outside the storefront layout, the 404
      // probe — cost thirty seconds instead of fifteen, in this sweep and in
      // every other suite that navigates through here. It looked like a slow
      // network rather than a bug because the number was plausible.
      undefined,
      { timeout: options.hydrationTimeout ?? HYDRATION_TIMEOUT }
    );
  } catch {
    // Not fatal on its own: let the caller's checks report what's missing.
  }
  return response;
}

/**
 * True if `selector` appears within `timeout`, false if it never does.
 *
 * `locator().count()` resolves immediately, so asserting with it straight
 * after a navigation is a race: hydration marks the document ready before
 * every client island has necessarily re-rendered. Use this for presence
 * checks that should pass once the thing shows up, and plain count() only
 * when asserting something is ABSENT.
 */
export async function appears(page, selector, timeout = 5000) {
  try {
    await page.locator(selector).first().waitFor({ state: "attached", timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clicks `selector` once React has attached its handlers to it — or, after
 * `timeout`, clicks anyway, so a change in React's internals degrades to the
 * old behaviour instead of failing every flow.
 *
 * goto() returns on `data-hydrated`, which StoreHydrator sets from the root
 * layout. The product page sits inside its own Suspense boundary
 * (loading.tsx), and that boundary hydrates later: on 10 of 10 fresh loads the
 * Add to Bag button had no handlers when the flag flipped, by 74-597ms. A click
 * in that window can be lost outright — 2 of 15 first clicks did nothing, and
 * the same button worked on a second click — so the suite reported a lost cart
 * when the item had never been added.
 *
 * Reads React's `__reactProps$…` expando, which is an internal. That is why
 * it degrades rather than throws.
 */
export async function clickWhenLive(page, selector, timeout = 5000) {
  const target = page.locator(selector).first();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const live = await target.evaluate((el) =>
        Object.keys(el).some((k) => k.startsWith("__reactProps"))
      );
      if (live) break;
    } catch {
      // Not attached yet — keep waiting.
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await target.click();
}
