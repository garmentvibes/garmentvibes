// R2 — a click the instant the product page reports ready must land.
//
// Two different questions, and they must not be measured on the same load:
//
//   GUARD   (the suite): clickWhenLive waits for React before clicking.
//           Pass = 0 lost of 15. Also reports how many loads hit the risky
//           window, because 0 lost out of 15 loads that all dodged the window
//           proves nothing.
//
//   SHOPPER (a customer's tap): a plain click the moment goto() returns, and
//           then a SECOND tap on the same page. Only a loss that a second tap
//           rescues is the hydration race; a loss that survives two taps is
//           something else refusing.
//
// ⚠️ 14-Oct: measuring "was React listening?" on the same load as the shopper
// tap DELAYED the very click it was measuring — exposure fell from 14/15 to
// 2/15 and the risk looked gone. Exposure is therefore measured on its own
// loads, below.
//
// The shopper half is an open finding, not a gate: it is intermittent and
// load-dependent (2/15 on 14-Sep, then 2/15, 0/15 and 15/15 on 14-Oct). The
// exit code follows the GUARD only.
//
//   npm run start -- -H 127.0.0.1
//   node scripts/qa/r2-first-tap.mjs
import { launchBrowser } from "./_launch-browser.mjs";
import { goto, clickWhenLive } from "./_goto.mjs";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const PRODUCT = `${BASE_URL}/shop/product/classic-crew-neck-tee`;
const LOADS = 15;

const browser = await launchBrowser();

/** The header's bag badge renders only once the store holds the line. */
async function reachedBag(page) {
  return page
    .locator('[aria-label="Cart"] span')
    .first()
    .waitFor({ state: "attached", timeout: 4000 })
    .then(() => true)
    .catch(() => false);
}

async function freshPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await goto(page, PRODUCT);
  return { context, page };
}

// --- GUARD: as the suite clicks -------------------------------------------
let guardLost = 0;
let guardExposed = 0;
for (let i = 0; i < LOADS; i++) {
  const { context, page } = await freshPage();
  // Safe to ask here: clickWhenLive waits anyway, so the question costs the
  // measurement nothing.
  const live = await page
    .locator("text=Add to Bag")
    .first()
    .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
    .catch(() => false);
  if (!live) guardExposed += 1;

  await clickWhenLive(page, "text=Add to Bag");
  if (!(await reachedBag(page))) guardLost += 1;
  await context.close();
}

// --- SHOPPER: a plain tap, then a second one ------------------------------
let firstLanded = 0;
let rescuedBySecond = 0;
let neverLanded = 0;
for (let i = 0; i < LOADS; i++) {
  const { context, page } = await freshPage();
  await page.locator("text=Add to Bag").first().click({ timeout: 5000 }).catch(() => {});
  if (await reachedBag(page)) {
    firstLanded += 1;
  } else {
    await page.locator("text=Add to Bag").first().click({ timeout: 5000 }).catch(() => {});
    if (await reachedBag(page)) rescuedBySecond += 1;
    else neverLanded += 1;
  }
  await context.close();
}

// --- EXPOSURE: its own loads, nothing else done on them -------------------
let shopperExposed = 0;
for (let i = 0; i < LOADS; i++) {
  const { context, page } = await freshPage();
  const live = await page
    .locator("text=Add to Bag")
    .first()
    .evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))
    .catch(() => false);
  if (!live) shopperExposed += 1;
  await context.close();
}

await browser.close();

console.log(`R2 guard (clickWhenLive): ${guardLost}/${LOADS} lost — pass is 0`);
console.log(`         risky window hit: ${guardExposed}/${LOADS} loads — if this is 0, the run dodged the window and proves nothing`);
console.log(`R2 shopper (plain tap):   ${firstLanded}/${LOADS} landed first try · ${rescuedBySecond} rescued by a second tap (these are the race) · ${neverLanded} never landed (not the race)`);
console.log(`         risky window hit: ${shopperExposed}/${LOADS} loads, measured separately`);
console.log("\nThe shopper line is an OPEN FINDING, not a gate — his call since 14-Sep.");

if (guardLost === 0) {
  console.log(guardExposed === 0 ? "\nPASS — but with zero exposure, so run it again when the machine is busier" : "\nPASS");
  process.exit(0);
}
console.log("\nFAIL");
process.exit(1);
