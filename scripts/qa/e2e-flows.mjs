// End-to-end business-flow QA — drives the actual UI through every flow that
// encodes a real product/business decision, so a future change that breaks
// one is caught immediately rather than discovered by a human later.
//
// Requires a running server — start `npm run dev` first, then:
//   node scripts/qa/e2e-flows.mjs
// Each run uses a fresh browser context (empty localStorage), so flows that
// depend on earlier state (e.g. checkout needing an item in cart) chain
// within a single flow function rather than across functions.

import { launchBrowser } from "./_launch-browser.mjs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const results = [];
function check(flow, name, cond) {
  results.push({ flow, name, pass: !!cond });
}

async function withPage(browser, fn) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await fn(page);
  await page.close();
  return errors;
}

const browser = await launchBrowser();
let allConsoleErrors = [];

// ---------------------------------------------------------------------------
// Retail: browse, wishlist, filter, search
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/shop/product/floral-anarkali-kurta`, { waitUntil: "networkidle" });
    await page.click('button[aria-label="Add to wishlist"]');
    await page.waitForTimeout(200);
    await page.goto(`${BASE_URL}/shop/wishlist`, { waitUntil: "networkidle" });
    check("retail-discovery", "wishlist shows saved item", (await page.locator("text=Floral Printed Anarkali Kurta").count()) > 0);

    await page.goto(`${BASE_URL}/shop/women`, { waitUntil: "networkidle" });
    const before = await page.locator("text=/Showing \\d+/").first().textContent();
    await page.click('text="Under ₹999"');
    await page.waitForTimeout(300);
    const after = await page.locator("text=/Showing \\d+|No products/").first().textContent();
    check("retail-discovery", "price filter changes result count", before !== after);

    await page.goto(`${BASE_URL}/shop/search?q=jeans`, { waitUntil: "networkidle" });
    check("retail-discovery", "search finds matching products", (await page.locator("text=/Jeans/i").count()) > 0);

    // Typo tolerance: a misspelling should still find the product.
    await page.goto(`${BASE_URL}/shop/search?q=kurtaa`, { waitUntil: "networkidle" });
    check("retail-discovery", "misspelled query still returns results", (await page.locator("text=/Kurta/i").count()) > 0);

    // Nonsense should return the recovery state, not a blank page.
    await page.goto(`${BASE_URL}/shop/search?q=zzzzqqqq`, { waitUntil: "networkidle" });
    check("retail-discovery", "no-results state offers category links", (await page.locator("text=/No products matched/").count()) > 0);

    // Autocomplete dropdown suggests products as you type.
    await page.goto(`${BASE_URL}/shop`, { waitUntil: "networkidle" });
    await page.fill('input[aria-label="Search products"]', "saree");
    await page.waitForTimeout(300);
    check("retail-discovery", "search autocomplete shows suggestions", (await page.locator("#search-suggestions li").count()) > 0);

    // Colour and discount facets, plus pagination.
    await page.goto(`${BASE_URL}/shop/women`, { waitUntil: "networkidle" });
    const beforeColour = await page.locator("text=/Showing \\d+/").first().textContent();
    await page.click('text="Black"');
    await page.waitForTimeout(300);
    const afterColour = await page.locator("text=/Showing \\d+|No products/").first().textContent();
    check("retail-discovery", "colour filter narrows results", beforeColour !== afterColour);

    await page.goto(`${BASE_URL}/shop/women`, { waitUntil: "networkidle" });
    await page.click('text="40% and above"');
    await page.waitForTimeout(300);
    check("retail-discovery", "discount filter applies", (await page.locator("text=/Showing \\d+|No products/").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Retail: address book -> gated checkout -> redirect-back -> COD order
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/shop/addresses`, { waitUntil: "networkidle" });
    await page.click("text=Add Address");
    await page.fill("#label", "Home");
    await page.fill("#fullName", "QA Buyer");
    await page.fill("#phone", "9999999999");
    await page.fill("#addressLine1", "1 QA Lane");
    await page.fill("#city", "Mumbai");
    await page.fill("#state", "Maharashtra");
    await page.fill("#pincode", "400001");
    await page.click('button:has-text("Save Address")');
    await page.waitForTimeout(200);
    check("retail-checkout", "address saved and listed", (await page.locator("text=QA Buyer").count()) > 0);

    await page.goto(`${BASE_URL}/shop/product/classic-crew-neck-tee`, { waitUntil: "networkidle" });
    await page.click("text=Add to Bag");
    await page.waitForTimeout(200);
    await page.goto(`${BASE_URL}/shop/checkout`, { waitUntil: "networkidle" });
    check("retail-checkout", "checkout gated when signed out", (await page.locator("text=Sign in to check out").count()) > 0);

    await page.getByRole("link", { name: "Sign In", exact: true }).click();
    await page.waitForURL("**/shop/login**");
    check("retail-checkout", "login URL carries redirect param", page.url().includes("redirect=") && page.url().includes("checkout"));
    await page.fill("#email", "qa-shopper@example.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/shop/checkout");
    await page.waitForTimeout(300);
    check("retail-checkout", "cart preserved across login redirect", (await page.locator("text=Classic Crew Neck").count()) > 0);

    await page.click('button:has-text("Use Home")');
    check("retail-checkout", "quick-fill from saved address", (await page.inputValue("#fullName")) === "QA Buyer");
    await page.fill('input[placeholder="Promo code"]', "GARMENT10");
    await page.click('button:has-text("Apply")');
    await page.waitForTimeout(200);
    check("retail-checkout", "promo code applied", (await page.locator("text=GARMENT10 applied").count()) > 0);

    await page.click("text=Cash on Delivery");
    await page.click('button:has-text("Place Order (COD)")');
    await page.waitForURL("**/shop/order-confirmation**");
    check("retail-checkout", "COD confirmation shows pay-on-delivery note", (await page.locator("text=Pay in cash when your order arrives").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Retail: stock levels, delivery estimate, review submission
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/shop/product/floral-anarkali-kurta`, { waitUntil: "networkidle" });

    // XL is seeded out of stock in the mock catalog, so its size button must
    // be disabled rather than merely styled as unavailable.
    const xl = page.locator('button:text-is("XL")').first();
    check("retail-product", "out-of-stock size is disabled", await xl.isDisabled());

    // Pincode estimate: metro lane should be faster than the fallback lane.
    await page.fill('input[aria-label="Delivery PIN code"]', "560001");
    await page.click('button:has-text("Check")');
    await page.waitForTimeout(300);
    check("retail-product", "metro pincode returns a fast estimate", (await page.locator("text=Bengaluru").count()) > 0);

    await page.fill('input[aria-label="Delivery PIN code"]', "190001");
    await page.click('button:has-text("Check")');
    await page.waitForTimeout(300);
    check("retail-product", "remote pincode flags COD unavailable", (await page.locator("text=/Cash on Delivery isn/").count()) > 0);

    await page.fill('input[aria-label="Delivery PIN code"]', "123");
    await page.click('button:has-text("Check")');
    await page.waitForTimeout(300);
    check("retail-product", "invalid pincode is rejected", (await page.locator("text=/valid 6-digit/").count()) > 0);

    // Reviews require sign-in.
    check("retail-product", "review prompts sign-in when signed out", (await page.locator('a:has-text("Sign in to review")').count()) > 0);

    await page.goto(`${BASE_URL}/shop/login`, { waitUntil: "networkidle" });
    await page.fill("#email", "reviewer@example.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/shop");

    await page.goto(`${BASE_URL}/shop/product/floral-anarkali-kurta`, { waitUntil: "networkidle" });
    await page.click('button:has-text("Write a review")');
    await page.click('button[aria-label="5 stars"]');
    await page.fill("#review-title", "QA review title");
    await page.fill("#review-body", "Tested via the automated QA suite.");
    await page.click('button:has-text("Submit review")');
    await page.waitForTimeout(400);
    check("retail-product", "submitted review appears on the product", (await page.locator("text=QA review title").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Retail: order detail, timeline, invoice, self-service cancellation
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/shop/orders`, { waitUntil: "networkidle" });
    check("retail-orders", "order list renders", (await page.locator('a[href^="/shop/orders/"]').count()) > 0);

    // A delivered order can't be cancelled; a pending one can. Pick the
    // pending one explicitly so the assertion isn't order-dependent.
    await page.goto(`${BASE_URL}/shop/orders/GV83997211`, { waitUntil: "networkidle" });
    check("retail-orders", "order detail shows status timeline", (await page.locator("text=Order placed").count()) > 0);
    check("retail-orders", "pending order offers cancellation", (await page.locator('button:has-text("Cancel order")').count()) > 0);

    // Invoice renders with the operating entity and GSTIN on it.
    await page.goto(`${BASE_URL}/shop/orders/GV83997211/invoice`, { waitUntil: "networkidle" });
    check("retail-orders", "invoice shows INVOICE heading", (await page.locator("text=INVOICE").count()) > 0);
    check("retail-orders", "invoice carries GSTIN", (await page.locator("text=/GSTIN/").count()) > 0);

    // Cancel, and confirm it sticks and removes the cancel affordance.
    await page.goto(`${BASE_URL}/shop/orders/GV83997211`, { waitUntil: "networkidle" });
    await page.click('button:has-text("Cancel order")');
    await page.click('button:has-text("Yes, cancel order")');
    await page.waitForTimeout(400);
    check("retail-orders", "cancelled order shows cancelled state", (await page.locator("text=Order cancelled").count()) > 0);
    check("retail-orders", "cancelled order no longer offers cancellation", (await page.locator('button:has-text("Cancel order")').count()) === 0);

    // A delivered order should never offer cancellation.
    await page.goto(`${BASE_URL}/shop/orders/GV84098771`, { waitUntil: "networkidle" });
    check("retail-orders", "delivered order cannot be cancelled", (await page.locator('button:has-text("Cancel order")').count()) === 0);
  }))
);

// ---------------------------------------------------------------------------
// Wholesale: new signup starts pending -> quote allowed, direct order locked
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/wholesale/product/cotton-round-neck-tee-bulk`, { waitUntil: "networkidle" });
    await page.click("text=Add to Order");
    await page.waitForTimeout(200);

    await page.goto(`${BASE_URL}/wholesale/signup`, { waitUntil: "networkidle" });
    await page.fill("#businessName", "QA Traders");
    await page.fill("#contactName", "QA Contact");
    await page.fill("#email", "qa@traders.example");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Create business account")');
    await page.waitForURL("**/wholesale/dashboard");

    await page.goto(`${BASE_URL}/wholesale/order`, { waitUntil: "networkidle" });
    check("wholesale-pending", "pending account sees lock message", (await page.locator("text=Placing orders directly unlocks once your account is approved").count()) > 0);
    check("wholesale-pending", "Place Order Directly hidden while pending", (await page.locator('button:has-text("Place Order Directly")').count()) === 0);
    await page.click('button:has-text("Request Quote")');
    await page.waitForURL("**/wholesale/quote-confirmation**");
    check("wholesale-pending", "pending account can still request a quote", (await page.locator("text=Request received").count()) > 0);

    await page.goto(`${BASE_URL}/wholesale/settings`, { waitUntil: "networkidle" });
    check("wholesale-pending", "settings shows Pending Verification badge", (await page.locator("text=Pending Verification").count()) > 0);
    check("wholesale-pending", "credit terms button disabled while pending", await page.locator('button:has-text("Request Net-30 Credit Terms")').isDisabled());
  }))
);

// ---------------------------------------------------------------------------
// Wholesale: returning login is approved -> direct order + credit terms
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/wholesale/login`, { waitUntil: "networkidle" });
    await page.fill("#email", "qa-buyer@example.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/wholesale/dashboard");

    await page.goto(`${BASE_URL}/wholesale/product/denim-jeans-bulk`, { waitUntil: "networkidle" });
    await page.click("text=Add to Order");
    await page.waitForTimeout(200);
    await page.goto(`${BASE_URL}/wholesale/order`, { waitUntil: "networkidle" });
    check("wholesale-approved", "approved account sees Place Order Directly", (await page.locator('button:has-text("Place Order Directly")').count()) > 0);

    await page.goto(`${BASE_URL}/wholesale/settings`, { waitUntil: "networkidle" });
    check("wholesale-approved", "settings shows Approved badge", (await page.locator("text=Approved").count()) > 0);
    await page.click('button:has-text("Request Net-30 Credit Terms")');
    await page.waitForTimeout(200);
    check("wholesale-approved", "credit terms request confirmed", (await page.locator("text=Net-30 credit terms requested").count()) > 0);

    await page.goto(`${BASE_URL}/wholesale/team`, { waitUntil: "networkidle" });
    await page.fill("#name", "QA Team Member");
    await page.fill("#email", "member@qa.example");
    await page.click('button:has-text("Invite")');
    await page.waitForTimeout(200);
    check("wholesale-approved", "team member invited and listed", (await page.locator("text=QA Team Member").count()) > 0);

    await page.goto(`${BASE_URL}/wholesale/dashboard`, { waitUntil: "networkidle" });
    await page.click('button:has-text("Reorder") >> nth=0');
    await page.waitForTimeout(200);
    await page.goto(`${BASE_URL}/wholesale/order`, { waitUntil: "networkidle" });
    check("wholesale-approved", "reorder added items to order review", (await page.locator("text=/units/").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Wholesale: pricing calculator + CSV bulk upload on Quick Order
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await page.goto(`${BASE_URL}/wholesale/pricing-calculator`, { waitUntil: "networkidle" });
    const priceBefore = await page.locator("text=PRICE PER UNIT").locator("..").textContent();
    await page.fill("#calc-qty", "700");
    await page.waitForTimeout(200);
    const priceAfter = await page.locator("text=PRICE PER UNIT").locator("..").textContent();
    check("wholesale-tools", "pricing calculator updates with quantity", priceBefore !== priceAfter);

    await page.goto(`${BASE_URL}/wholesale/quick-order`, { waitUntil: "networkidle" });
    check("wholesale-tools", "quick order page loads with product table", (await page.locator("table").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Admin: access gating, approvals, order/quote status, product CRUD
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    // Gating: admin routes are unusable without an admin session.
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    check("admin", "admin gated when signed out", (await page.locator("text=Admin access required").count()) > 0);

    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: "networkidle" });
    await page.fill("#email", "staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");
    check("admin", "admin login reaches dashboard", (await page.locator("text=Dashboard").count()) > 0);

    // The approval queue is the counterpart to the storefront's pending state.
    await page.goto(`${BASE_URL}/admin/accounts`, { waitUntil: "networkidle" });
    const pendingBefore = await page.locator('button:has-text("Approve")').count();
    check("admin", "pending accounts awaiting approval are listed", pendingBefore > 0);
    await page.click('button:has-text("Approve") >> nth=0');
    await page.waitForTimeout(300);
    const pendingAfter = await page.locator('button:has-text("Approve")').count();
    check("admin", "approving an account removes it from the pending queue", pendingAfter < pendingBefore);

    // Retail order status transition persists to the list view.
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "networkidle" });
    await page.click('a[href^="/admin/orders/"] >> nth=0');
    await page.waitForURL("**/admin/orders/**");
    await page.click('button:has-text("shipped")');
    await page.waitForTimeout(300);
    await page.goto(`${BASE_URL}/admin/orders`, { waitUntil: "networkidle" });
    check("admin", "retail order status change persists", (await page.locator("text=shipped").count()) > 0);

    // Wholesale quote status transition.
    await page.goto(`${BASE_URL}/admin/quotes`, { waitUntil: "networkidle" });
    await page.click('a[href^="/admin/quotes/"] >> nth=0');
    await page.waitForURL("**/admin/quotes/**");
    await page.click('button:has-text("Confirmed")');
    await page.waitForTimeout(300);
    check("admin", "quote status change applies", (await page.locator("text=Confirmed").count()) > 0);

    // Product creation shows up in the catalog list.
    await page.goto(`${BASE_URL}/admin/products/retail/new`, { waitUntil: "networkidle" });
    await page.fill("#name", "QA Test Kurta");
    await page.fill("#brand", "QA Brand");
    await page.selectOption("#subcategory", "Kurtas");
    await page.fill("#price", "999");
    await page.fill("#mrp", "1499");
    await page.click('button:has-text("Create product")');
    await page.waitForURL("**/admin/products");
    await page.waitForTimeout(300);
    check("admin", "new retail product appears in the catalog list", (await page.locator("text=QA Test Kurta").count()) > 0);

    // Guardrail: wholesale tiers must not get more expensive at higher volume.
    await page.goto(`${BASE_URL}/admin/products/wholesale/new`, { waitUntil: "networkidle" });
    await page.fill("#name", "QA Bulk Tee");
    await page.fill("#sku", "GV-QA-001");
    await page.selectOption("#subcategory", "Basics");
    await page.fill("#moq", "100");
    await page.fill("#packSize", "10");
    await page.fill('input[aria-label="Tier 1 minimum quantity"]', "100");
    await page.fill('input[aria-label="Tier 1 price per unit"]', "200");
    await page.click('button:has-text("Add tier")');
    await page.fill('input[aria-label="Tier 2 minimum quantity"]', "500");
    await page.fill('input[aria-label="Tier 2 price per unit"]', "300"); // invalid: pricier at volume
    await page.click('button:has-text("Create product")');
    await page.waitForTimeout(400);
    check(
      "admin",
      "rejects a wholesale tier that costs more at higher quantity",
      page.url().includes("/admin/products/wholesale/new")
    );
  }))
);

await browser.close();

const failed = results.filter((r) => !r.pass);
const flows = [...new Set(results.map((r) => r.flow))];
for (const flow of flows) {
  const flowResults = results.filter((r) => r.flow === flow);
  const flowFailed = flowResults.filter((r) => !r.pass);
  console.log(`\n${flow} (${flowResults.length - flowFailed.length}/${flowResults.length})`);
  for (const r of flowResults) console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}`);
}

if (allConsoleErrors.length > 0) {
  console.log(`\n✗ ${allConsoleErrors.length} console error(s) during flows:`);
  for (const e of allConsoleErrors) console.log(`  - ${e.slice(0, 200)}`);
}

const totalIssues = failed.length + allConsoleErrors.length;
console.log(`\n${totalIssues === 0 ? "PASS" : "FAIL"}: ${failed.length} check failure(s), ${allConsoleErrors.length} console error(s)`);
process.exit(totalIssues === 0 ? 0 : 1);
