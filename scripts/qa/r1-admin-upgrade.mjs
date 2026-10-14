// R1 — after an admin signs out, nothing may be upgraded to https://localhost.
//
// The finding (13-Sep): over plain http, the CSP's upgrade-insecure-requests
// directive upgraded the *redirect hop* of a signed-out admin navigation, so
// the browser tried https against a server that speaks only http. 36 such
// requests in 3 rounds. cc7651c keeps the directive off plain-http builds.
//
// The control is built in: with a session still valid, the count must also be
// 0. If that round ever reports some, this measurement is broken, not the app
// — and a measurement that cannot fail proves nothing.
//
//   npm run start -- -H 127.0.0.1      (with ALLOW_DEMO_ADMIN=1)
//   node scripts/qa/r1-admin-upgrade.mjs
import { launchBrowser } from "./_launch-browser.mjs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const ROUNDS = 3;

const browser = await launchBrowser();

async function round(dropSession) {
  const context = await browser.newContext();
  const page = await context.newPage();
  let upgraded = 0;
  page.on("request", (r) => {
    if (r.url().startsWith("https://localhost")) upgraded += 1;
  });

  await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "load" });
  await page.fill("#email", "staff@garmentvibes.com");
  await page.fill("#password", "password123");
  await page.click('button:has-text("Sign in")');
  await page.waitForURL("**/admin", { timeout: 20000 });

  // Dropping the cookies is what makes the next navigation a redirect to the
  // login page — the exact shape that was being upgraded. A direct fetch or a
  // plain page load does NOT reproduce it, which is why an early probe wrongly
  // ruled the CSP out.
  if (dropSession) await context.clearCookies();

  for (const href of ["/admin/orders", "/admin/quotes", "/admin/promos"]) {
    await page.click(`a[href="${href}"]`).catch(() => {});
    await page.waitForTimeout(1200);
  }

  await context.close();
  return upgraded;
}

let signedOut = 0;
let control = 0;
for (let i = 0; i < ROUNDS; i++) signedOut += await round(true);
for (let i = 0; i < ROUNDS; i++) control += await round(false);

await browser.close();

console.log(`R1 signed out, ${ROUNDS} rounds: ${signedOut} https://localhost request(s) — pass is 0, before the fix it was 36`);
console.log(`R1 control, session still valid: ${control} — must also be 0`);

if (signedOut === 0 && control === 0) {
  console.log("\nPASS");
  process.exit(0);
}
console.log(`\nFAIL${control !== 0 ? " — and the control fired, so trust the measurement before the app" : ""}`);
process.exit(1);
