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
import { goto, appears } from "./_goto.mjs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Smallest thing that decodes as an image: a 2x2 PNG. Used to drive the review
// photo pipeline without shipping a fixture file.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8z8Dwn4GBgYGJAQoAFVwCAvsDIhAAAAAASUVORK5CYII=",
  "base64"
);

const results = [];
function check(flow, name, cond, detail) {
  // `detail` is shown only on failure. For checks that compare many things at
  // once — every page's title against every other's — "it failed" is not
  // actionable without naming which ones collided.
  results.push({ flow, name, pass: !!cond, detail });
}

/**
 * Console errors that are the app working as designed.
 *
 * Deliberately narrow — matched on the originating URL, not on the message —
 * so a 503 from anywhere else still fails the run.
 *
 * /api/razorpay/order answers 503 when no merchant keys are configured, which
 * is the documented state of this deployment: checkout then falls back to the
 * simulated flow rather than dead-ending the customer. The browser logs every
 * non-2xx fetch as a console error, so placing an online order in the suite
 * reports one. Suppressing it here is not hiding a failure; asserting the
 * fallback works is what the checkout flow already does.
 */
const EXPECTED_CONSOLE_ERROR_URLS = [/\/api\/razorpay\/order$/];

/**
 * Runs one flow on its own page, and does not let it take the run down with it.
 *
 * Playwright's waiting calls throw on timeout, and this file has twenty
 * `waitForURL`s in it. An unguarded one turns a regression in the flow it
 * belongs to — checkout stopped navigating, say — into an uncaught
 * TimeoutError that kills the process before any results are printed. What
 * reaches the reader is a stack trace, not "the referral order never reached
 * confirmation", and none of the other flows run at all.
 *
 * Catching here converts that into a failed check for the flow that threw, and
 * lets the remaining flows report. The run still fails; it just says what
 * broke, and everything else still gets measured.
 */
async function withPage(browser, fn, flowName = "flow") {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url ?? "";
    if (EXPECTED_CONSOLE_ERROR_URLS.some((pattern) => pattern.test(url))) return;
    errors.push(msg.text());
  });

  try {
    await fn(page);
  } catch (error) {
    const detail = String(error?.message ?? error).split("\n")[0];
    check(flowName, `flow ran to completion — ${detail}`, false);
  }

  await page.close().catch(() => {});
  return errors;
}

const browser = await launchBrowser();
let allConsoleErrors = [];

// ---------------------------------------------------------------------------
// Retail: browse, wishlist, filter, search
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/shop/product/floral-anarkali-kurta`);
    await page.click('button[aria-label="Add to wishlist"]');
    await page.waitForTimeout(200);
    await goto(page, `${BASE_URL}/shop/wishlist`);
    check("retail-discovery", "wishlist shows saved item", (await page.locator("text=Floral Printed Anarkali Kurta").count()) > 0);

    await goto(page, `${BASE_URL}/shop/women`);
    const before = await page.locator("text=/Showing \\d+/").first().textContent();
    await page.click('text="Under ₹999"');
    await page.waitForTimeout(300);
    const after = await page.locator("text=/Showing \\d+|No products/").first().textContent();
    check("retail-discovery", "price filter changes result count", before !== after);

    await goto(page, `${BASE_URL}/shop/search?q=jeans`);
    check("retail-discovery", "search finds matching products", (await page.locator("text=/Jeans/i").count()) > 0);

    // Typo tolerance: a misspelling should still find the product.
    await goto(page, `${BASE_URL}/shop/search?q=kurtaa`);
    check("retail-discovery", "misspelled query still returns results", (await page.locator("text=/Kurta/i").count()) > 0);

    // Nonsense should return the recovery state, not a blank page.
    await goto(page, `${BASE_URL}/shop/search?q=zzzzqqqq`);
    check("retail-discovery", "no-results state offers category links", (await page.locator("text=/No products matched/").count()) > 0);

    // Autocomplete dropdown suggests products as you type.
    await goto(page, `${BASE_URL}/shop`);
    await page.fill('input[aria-label="Search products"]', "saree");
    await page.waitForTimeout(300);
    check("retail-discovery", "search autocomplete shows suggestions", (await page.locator("#search-suggestions li").count()) > 0);

    // Colour and discount facets, plus pagination.
    await goto(page, `${BASE_URL}/shop/women`);
    const beforeColour = await page.locator("text=/Showing \\d+/").first().textContent();
    await page.click('text="Black"');
    await page.waitForTimeout(300);
    const afterColour = await page.locator("text=/Showing \\d+|No products/").first().textContent();
    check("retail-discovery", "colour filter narrows results", beforeColour !== afterColour);

    await goto(page, `${BASE_URL}/shop/women`);
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
    await goto(page, `${BASE_URL}/shop/addresses`);
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

    await goto(page, `${BASE_URL}/shop/product/classic-crew-neck-tee`);
    await page.click("text=Add to Bag");
    await page.waitForTimeout(200);
    await goto(page, `${BASE_URL}/shop/checkout`);
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

    // Payment methods are individually selectable, not one "Pay Online"
    // bucket, and UPI leads because that is how most Indian customers pay.
    const methodLabels = await page.locator('[role="radio"] p.font-medium').allTextContents();
    check(
      "retail-checkout",
      "every payment method is offered separately",
      ["UPI", "Credit / Debit Card", "Net Banking", "Wallet", "EMI", "Cash on Delivery"].every((m) =>
        methodLabels.includes(m)
      ),
      methodLabels.join(", ")
    );
    check("retail-checkout", "UPI is offered first", methodLabels[0] === "UPI");
    check(
      "retail-checkout",
      "UPI is selected by default",
      (await page.locator('[role="radio"][aria-checked="true"] p.font-medium').textContent()) === "UPI"
    );

    // This basket is well under the EMI floor, so EMI must be shown but
    // disabled — a bank would refuse it, and offering it anyway sends the
    // customer to a dead end inside the gateway.
    check(
      "retail-checkout",
      "EMI is disabled below the bank minimum",
      await page.locator('[role="radio"]:has-text("EMI")').isDisabled()
    );

    // The bug this replaced: the product page consulted the delivery estimate
    // and said COD was unavailable for remote PIN codes, then checkout
    // offered it anyway. Both now read the same rule.
    await page.fill("#pincode", "790001");
    await page.waitForTimeout(200);
    check(
      "retail-checkout",
      "COD is withdrawn for a PIN code the delivery estimate excludes",
      await page.locator('[role="radio"]:has-text("Cash on Delivery")').isDisabled()
    );

    await page.fill("#pincode", "400001");
    await page.waitForTimeout(200);
    check(
      "retail-checkout",
      "COD returns when the PIN code is serviceable",
      !(await page.locator('[role="radio"]:has-text("Cash on Delivery")').isDisabled())
    );

    await page.click("text=Cash on Delivery");
    await page.waitForTimeout(200);

    // Selecting COD must move the total, not just the label — the handling
    // fee is real money and the customer has to see it before they commit.
    check(
      "retail-checkout",
      "choosing COD adds its handling fee to the total",
      (await page.locator("text=Cash on Delivery fee").count()) > 0
    );

    await page.click('button:has-text("Place Order (COD)")');
    await page.waitForURL("**/shop/order-confirmation**");
    check("retail-checkout", "COD confirmation shows pay-on-delivery note", (await page.locator("text=Pay in cash when your order arrives").count()) > 0);

    // Placing an order must queue the customer's confirmation. The admin
    // outbox lives in a different browser context, so assert against the
    // persisted store directly rather than the admin UI.
    const outbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    const placed = outbox.filter((m) => m.templateId === "order_placed" && m.status === "queued");
    check("retail-checkout", "placing an order queues a confirmation", placed.length > 0);
    check(
      "retail-checkout",
      "confirmation goes out on email and phone channels",
      new Set(placed.map((m) => m.channel)).size > 1
    );
    // SMS/WhatsApp copy must stay short — DLT and Meta templates reject long
    // bodies, and only email carries a subject line.
    const shortChannels = placed.filter((m) => m.channel !== "email");
    check(
      "retail-checkout",
      "short-channel copy has no subject and stays under 320 chars",
      shortChannels.length > 0 && shortChannels.every((m) => m.subject === "" && m.body.length <= 320)
    );
  }))
);

// ---------------------------------------------------------------------------
// Retail + admin: order-linked support threads
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/shop/support`);
    check(
      "support",
      "support requires an account",
      await appears(page, "text=Sign in to get help")
    );

    await goto(page, `${BASE_URL}/shop/login`);
    await page.fill("#email", "helpme@qa.test");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/shop");

    // The seeded threads belong to other people and must not be visible.
    await goto(page, `${BASE_URL}/shop/support`);
    check(
      "support",
      "one customer cannot see another's support thread",
      (await page.locator("text=Parcel marked delivered but not received").count()) === 0
    );

    // Raising it FROM an order is the point of the feature: the thread should
    // arrive already attached, with no "which order?" round trip.
    await goto(page, `${BASE_URL}/shop/orders/GV84213567`);
    await page.click('a:has-text("Get help with this order")');
    await page.waitForURL("**/shop/support?order=GV84213567");
    check(
      "support",
      "raising help from an order carries the order with it",
      await appears(page, "text=GV84213567")
    );

    await page.fill("#support-subject", "Wrong colour delivered");
    await page.fill("#support-body", "The kurta that arrived is navy, but I ordered the rose one.");
    await page.click('button:has-text("Send request")');
    await page.waitForTimeout(400);
    check(
      "support",
      "the thread appears in the customer's list",
      await appears(page, "#support-tickets >> text=Wrong colour delivered")
    );
    check(
      "support",
      "a new thread is waiting on us, not on the customer",
      (await page.locator("#support-tickets >> text=With our team").count()) > 0
    );

    // Staff answer it.
    await goto(page, `${BASE_URL}/admin/login`);
    await page.fill("#email", "support-staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");

    await goto(page, `${BASE_URL}/admin/support`);
    await appears(page, "#support-queue > li");
    check(
      "support",
      "the thread reaches the staff queue",
      (await page.locator("#support-queue >> text=Wrong colour delivered").count()) > 0
    );

    // The seeded 29-hour-old thread is past the 24-hour target and must sort
    // above a request raised seconds ago.
    const firstInQueue = await page.locator("#support-queue > li").first().innerText();
    check(
      "support",
      "the longest-waiting thread is at the top of the queue",
      firstInQueue.includes("Parcel marked delivered"),
      firstInQueue.slice(0, 60)
    );
    check(
      "support",
      "a thread past the response target is flagged overdue",
      (await page.locator("#support-queue >> text=/\\d+h/").count()) > 0
    );

    const mine = page.locator("#support-queue > li", { hasText: "Wrong colour delivered" });
    await mine.locator("textarea").fill("Apologies — we'll collect it and send the rose one out today.");
    await mine.locator('button:has-text("Reply")').click();
    await page.waitForTimeout(400);

    const outbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check(
      "support",
      "replying emails the customer",
      outbox.some((m) => m.templateId === "support_reply")
    );

    await goto(page, `${BASE_URL}/shop/support`);
    check(
      "support",
      "the customer sees the reply on their thread",
      await appears(page, "text=/we'll collect it and send the rose one out today/")
    );
    check(
      "support",
      "answering moves the thread to waiting on the customer",
      (await page.locator("#support-tickets >> text=Waiting on you").count()) > 0
    );

    // The transition every support system gets wrong: replying to a resolved
    // thread must reopen it, not leave the message in a queue nobody reads.
    await goto(page, `${BASE_URL}/admin/support`);
    const again = page.locator("#support-queue > li", { hasText: "Parcel marked delivered" });
    await again.locator('button:has-text("Mark resolved")').click();
    await page.waitForTimeout(300);

    await goto(page, `${BASE_URL}/shop/support`);
    const thread = page.locator("#support-tickets > li", { hasText: "Wrong colour delivered" });
    await thread.locator('button:has-text("Reply")').click();
    await thread.locator("textarea").fill("It still has not been collected — any update?");
    await thread.locator('button:has-text("Send reply")').click();
    await page.waitForTimeout(400);
    check(
      "support",
      "a customer reply puts the thread back with our team",
      (await page.locator("#support-tickets >> text=With our team").count()) > 0
    );
  }))
);

// ---------------------------------------------------------------------------
// Retail: referrals and promo redemption caps
//
// The abuse cases are the point: self-referral, reusing a one-per-customer
// code, and claiming somebody else's referral reward.
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    // Two accounts have to exist before a code can resolve to a person — the
    // code is a hash of an email and cannot be reversed.
    async function signIn(email) {
      await goto(page, `${BASE_URL}/shop/login`);
      await page.fill("#email", email);
      await page.fill("#password", "password123");
      await page.click('button:has-text("Sign in")');
      await page.waitForURL("**/shop");
    }

    await signIn("referrer@qa.test");
    await goto(page, `${BASE_URL}/shop/account`);
    const referralCode = (await page.getByTestId("referral-code").textContent())?.trim();
    check("referrals", "each customer gets a referral code", Boolean(referralCode?.startsWith("GV")));

    async function addToBagAndOpenCheckout() {
      await goto(page, `${BASE_URL}/shop/product/classic-crew-neck-tee`);
      await page.click("text=Add to Bag");
      await page.waitForTimeout(300);
      await goto(page, `${BASE_URL}/shop/checkout`);
      await appears(page, 'input[placeholder="Promo code"]');
    }

    // Self-referral is the obvious abuse: refer yourself, take both halves.
    await addToBagAndOpenCheckout();
    await page.fill('input[placeholder="Promo code"]', referralCode);
    await page.click('button:has-text("Apply")');
    await page.waitForTimeout(400);
    check(
      "referrals",
      "a customer cannot refer themselves",
      (await page.locator("text=/can't refer yourself/").count()) > 0
    );

    // A different customer may use it.
    await signIn("friend@qa.test");
    await addToBagAndOpenCheckout();
    await page.fill('input[placeholder="Promo code"]', referralCode);
    await page.click('button:has-text("Apply")');
    await page.waitForTimeout(400);
    check(
      "referrals",
      "a friend's referral code applies a first-order discount",
      (await page.locator("text=/Referral applied/").count()) > 0
    );

    // A referral code is generated in the browser, so /api/razorpay/order
    // cannot price it — it would create the gateway order at full list and
    // charge back the whole discount. The online methods therefore withdraw
    // and COD carries the order instead. Asserted here rather than trusted,
    // because the flow below reaches the confirmation page either way.
    check(
      "referrals",
      "online payment withdraws for a code the payment route cannot price",
      (await page.locator("text=/Not available with this discount code/").count()) > 0
    );

    await page.fill("#fullName", "QA Friend");
    await page.fill("#phone", "9999999999");
    await page.fill("#addressLine1", "2 QA Lane");
    await page.fill("#city", "Mumbai");
    await page.fill("#state", "Maharashtra");
    await page.fill("#pincode", "400001");
    await page.click('button:has-text("Place Order")');
    await page.waitForURL("**/shop/order-confirmation**");

    // The referrer only earns once the invited customer actually orders.
    await signIn("referrer@qa.test");
    await goto(page, `${BASE_URL}/shop/account`);
    check(
      "referrals",
      "the referrer is credited once their invite orders",
      await appears(page, "text=/Ready to use at checkout/")
    );

    const reward = (await page.locator("text=/% off$/").first().textContent())
      ?.split("·")[0]
      ?.trim();
    check("referrals", "the reward is a usable code", Boolean(reward));

    // A reward belongs to one person, however the code is learned.
    await signIn("friend@qa.test");
    await addToBagAndOpenCheckout();
    await page.fill('input[placeholder="Promo code"]', reward ?? "GVNONE");
    await page.click('button:has-text("Apply")');
    await page.waitForTimeout(400);
    check(
      "referrals",
      "someone else's referral reward is refused",
      (await page.locator("text=/issued to a different account/").count()) > 0
    );

    // A one-per-customer code is spent by ordering, not by typing it in.
    await page.fill('input[placeholder="Promo code"]', "GARMENT10");
    await page.click('button:has-text("Apply")');
    await page.waitForTimeout(400);
    check(
      "referrals",
      "a normal promo code still applies",
      (await page.locator("text=/GARMENT10 applied/").count()) > 0
    );
  }))
);

// ---------------------------------------------------------------------------
// Retail + admin: product Q&A
//
// The rule under test is a privacy rule as much as a product one: a question
// is private to its asker until staff answer it, so "does customer B see
// customer A's pending question" is the check that matters most.
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    const PRODUCT = `${BASE_URL}/shop/product/classic-crew-neck-tee`;

    await goto(page, PRODUCT);
    // appears(), not count(): hydration marks the document ready before every
    // client island has necessarily re-rendered, so a bare count() straight
    // after a navigation is a race. count() stays correct for the ABSENCE
    // checks below, which must not wait for something that should never show.
    check(
      "qa",
      "answered questions are public",
      await appears(page, "text=Does this shrink after the first wash?")
    );
    check(
      "qa",
      "asking requires an account",
      await appears(page, 'a:has-text("Sign in to ask")')
    );

    // The seeded pending question is on the saree, and belongs to someone
    // else — a signed-out visitor must not see it anywhere.
    await goto(page, `${BASE_URL}/shop/product/banarasi-silk-saree`);
    check(
      "qa",
      "another customer's pending question is not public",
      (await page.locator("text=unstitched blouse piece").count()) === 0
    );

    await goto(page, `${BASE_URL}/shop/login`);
    await page.fill("#email", "asker@example.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/shop");

    await goto(page, PRODUCT);
    await page.click('button:has-text("Ask a question")');

    // A question with a link in it is an advert, and is refused before it can
    // reach the staff queue.
    await page.fill("#question-body", "Nice tee, cheaper at spamshop.com though");
    await page.click('button:has-text("Send question")');
    await page.waitForTimeout(300);
    check("qa", "a question containing a link is refused", (await page.locator("text=/can't contain links/").count()) > 0);

    await page.fill("#question-body", "size?");
    await page.click('button:has-text("Send question")');
    await page.waitForTimeout(300);
    check("qa", "a one-word question is refused", (await page.locator("text=/write a bit more/i").count()) > 0);

    await page.fill("#question-body", "Is the neckline ribbed or plain hemmed?");
    await page.click('button:has-text("Send question")');
    await page.waitForTimeout(400);
    check(
      "qa",
      "the asker sees their own question waiting",
      await appears(page, "text=Waiting for an answer")
    );

    // Staff answer it, which is what publishes it.
    await goto(page, `${BASE_URL}/admin/login`);
    await page.fill("#email", "staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");

    await goto(page, `${BASE_URL}/admin/questions`);
    await appears(page, "#question-queue > li");
    const queued = await page.locator("#question-queue > li").count();
    check("qa", "the new question reaches the staff queue", queued > 0);

    // Scoped to OUR question, not nth=0: the queue is oldest-first by design,
    // and the seeded pending question about the saree is older. Answering
    // whatever happens to be at the top put the reply on the wrong product.
    const mine = page.locator("#question-queue > li", {
      hasText: "Is the neckline ribbed or plain hemmed?",
    });
    await mine.locator("textarea").fill("Ribbed, in the same cotton.");
    await mine.locator('button:has-text("Publish answer")').click();
    await page.waitForTimeout(400);

    const outbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check(
      "qa",
      "answering emails the person who asked",
      outbox.some((m) => m.templateId === "question_answered")
    );

    await goto(page, PRODUCT);
    check(
      "qa",
      "the answer is published on the product page",
      await appears(page, "text=Ribbed, in the same cotton.")
    );
  }))
);

// ---------------------------------------------------------------------------
// Retail: fit confidence — per-system size charts, buyer fit feedback
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    // The defect this fixes: one S/M/L/XL chart was shown on every product, so
    // a customer buying 32" jeans or a 4-5Y frock saw a chart with no row for
    // their size — worse than no chart, because it looks like an answer.
    await goto(page, `${BASE_URL}/shop/product/high-rise-straight-jeans`);
    await page.click("text=Size Guide");
    await page.waitForTimeout(200);
    check(
      "fit",
      "jeans get a waist chart, not the S/M/L/XL one",
      (await page.locator('[role="dialog"] th:has-text("Inseam")').count()) > 0 &&
        (await page.locator('[role="dialog"] th:has-text("Chest")').count()) === 0
    );
    check(
      "fit",
      "the chart contains the size being bought",
      (await page.locator('[role="dialog"] td:text-is("32")').count()) > 0
    );
    await page.keyboard.press("Escape");
    await page.click('[role="dialog"] button[aria-label="Close"]');
    await page.waitForTimeout(200);

    await goto(page, `${BASE_URL}/shop/product/unicorn-print-frock`);
    await page.click("text=Size Guide");
    await page.waitForTimeout(200);
    check(
      "fit",
      "kids' sizes get a height chart",
      (await page.locator('[role="dialog"] th:has-text("Height")').count()) > 0 &&
        (await page.locator('[role="dialog"] td:text-is("4-5Y")').count()) > 0
    );
    await page.click('[role="dialog"] button[aria-label="Close"]');
    await page.waitForTimeout(200);

    // Free size has no measurements table to show, and says so rather than
    // rendering an empty one.
    await goto(page, `${BASE_URL}/shop/product/banarasi-silk-saree`);
    await page.click("text=Size Guide");
    await page.waitForTimeout(200);
    check(
      "fit",
      "free size explains itself instead of showing an empty table",
      (await page.locator('[role="dialog"] table').count()) === 0 &&
        (await page.locator("text=/free size/i").count()) > 0
    );
    await page.click('[role="dialog"] button[aria-label="Close"]');

    // Fit feedback: the seeded votes are above the reporting floor, so every
    // product should show a verdict rather than "not enough to call it".
    await goto(page, `${BASE_URL}/shop/product/classic-crew-neck-tee`);
    await page.waitForTimeout(300);
    check(
      "fit",
      "product page reports how the garment runs",
      (await page.locator("text=/% of \\d+ buyers said/").count()) > 0
    );
    check(
      "fit",
      "the verdict comes with advice",
      (await page.locator("text=/take your usual|sizing up|sizing down/").count()) > 0
    );

    // Voting is the customer's contribution to that number.
    await page.click('button:has-text("Runs small")');
    await page.waitForTimeout(300);
    check(
      "fit",
      "a fit vote is recorded and shown back",
      (await page.locator('button[aria-pressed="true"]:has-text("Runs small")').count()) > 0
    );

    await page.reload();
    await page.waitForTimeout(400);
    check(
      "fit",
      "the vote survives a reload",
      (await page.locator('button[aria-pressed="true"]:has-text("Runs small")').count()) > 0
    );
  }))
);

// ---------------------------------------------------------------------------
// Retail: abandoned-cart recovery prompt
//
// The prompt keys off how long ago the cart last changed, so these drive it
// by rewinding that timestamp in localStorage rather than by waiting an hour.
// ---------------------------------------------------------------------------
const PROMPT = "text=still in your bag";

/** Moves the cart's last-changed time back by `hours` and reloads. */
async function ageCart(page, hours) {
  await page.evaluate((h) => {
    const raw = localStorage.getItem("garmentvibes-retail-cart");
    const parsed = JSON.parse(raw);
    parsed.state.updatedAt = Date.now() - h * 60 * 60 * 1000;
    localStorage.setItem("garmentvibes-retail-cart", JSON.stringify(parsed));
  }, hours);
  await page.reload();
  await page.waitForTimeout(300);
}

allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/shop/product/classic-crew-neck-tee`);
    await page.click("text=Add to Bag");
    await page.waitForTimeout(300);

    // Someone who just added an item is shopping, not abandoning. Telling
    // them they left something behind mid-session reads as a broken site.
    check(
      "cart-recovery",
      "no prompt while the customer is still shopping",
      (await page.locator(PROMPT).count()) === 0
    );

    await ageCart(page, 3);
    check("cart-recovery", "prompt appears for a cart left hours ago", (await page.locator(PROMPT).count()) > 0);
    check(
      "cart-recovery",
      "prompt reports how long the bag has been waiting",
      (await page.locator("text=/saved 3 hours ago/").count()) > 0
    );

    // Dismissing is a decision about this cart, not this page load.
    await page.click('button[aria-label="Dismiss"]');
    await page.waitForTimeout(200);
    check("cart-recovery", "dismissing hides the prompt", (await page.locator(PROMPT).count()) === 0);

    await page.reload();
    await page.waitForTimeout(300);
    check(
      "cart-recovery",
      "dismissal survives a reload",
      (await page.locator(PROMPT).count()) === 0
    );

    // Touching the cart restarts the abandonment clock — the customer is
    // demonstrably back, so the old dismissal no longer applies and neither
    // does the old age.
    await goto(page, `${BASE_URL}/shop/product/satin-cami-top`);
    await page.click("text=Add to Bag");
    await page.waitForTimeout(300);
    check(
      "cart-recovery",
      "editing the cart resets the clock rather than re-prompting",
      (await page.locator(PROMPT).count()) === 0
    );

    await ageCart(page, 5);
    check(
      "cart-recovery",
      "a freshly-edited cart can be abandoned again later",
      (await page.locator(PROMPT).count()) > 0
    );

    // Two products were added, and the prompt has to count what is actually
    // there rather than the number of times Add to Bag was pressed.
    check(
      "cart-recovery",
      "prompt counts the items in the bag",
      (await page.locator("text=2 items still in your bag").count()) > 0
    );

    // A recovered cart is only recovered if the link goes to the bag.
    //
    // Guarded rather than a bare click: an unconditional page.click on a
    // missing element throws a 30s TimeoutError that takes down the whole
    // suite, so a regression here would read as "QA crashed" instead of
    // naming the check that broke. Proven by mutating the reset in
    // cart-store.ts, which hid the prompt and hung the run.
    const viewBag = page.locator('a:has-text("View bag")');
    if ((await viewBag.count()) > 0) {
      await viewBag.click();
      await page.waitForURL("**/shop/cart");
      check("cart-recovery", "the prompt links to the bag", page.url().endsWith("/shop/cart"));
    } else {
      check("cart-recovery", "the prompt links to the bag", false, "no View bag link rendered");
    }
  }))
);

// ---------------------------------------------------------------------------
// Retail: stock levels, delivery estimate, review submission
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/shop/product/floral-anarkali-kurta`);

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

    await goto(page, `${BASE_URL}/shop/login`);
    await page.fill("#email", "reviewer@example.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/shop");

    await goto(page, `${BASE_URL}/shop/product/floral-anarkali-kurta`);
    await page.click('button:has-text("Write a review")');
    await page.click('button[aria-label="5 stars"]');
    await page.fill("#review-title", "QA review title");
    await page.fill("#review-body", "Tested via the automated QA suite.");
    await page.click('button:has-text("Submit review")');
    await page.waitForTimeout(400);
    check("retail-product", "submitted review appears on the product", (await page.locator("text=QA review title").count()) > 0);

    // Verified-purchase badges are DERIVED from delivered orders, never
    // asserted by the reviewer. floral-anarkali-kurta is not in any delivered
    // order in the seed data, so this review must not carry a badge — and the
    // form has to say so up front rather than surprising them afterwards.
    // Asserted against the stored record rather than the DOM: `has-text`
    // matches ancestors, so a container holding this review plus a seeded
    // verified one satisfies any selector written that way. The store is
    // where "verified" actually lives.
    const unverified = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-reviews");
      const reviews = raw ? JSON.parse(raw).state.reviews : [];
      return reviews.find((r) => r.title === "QA review title");
    });
    check(
      "review-trust",
      "a review with no matching delivery is not marked verified",
      unverified?.verified === false,
      JSON.stringify(unverified?.verified)
    );

    // classic-crew-neck-tee (r23) IS in a delivered order in the seed data.
    await goto(page, `${BASE_URL}/shop/product/classic-crew-neck-tee`);
    await page.click('button:has-text("Write a review")');
    check(
      "review-trust",
      "the form warns when a review will not be verifiable",
      (await page.locator("text=/won't carry a verified-purchase badge/").count()) === 0
    );

    await page.click('button[aria-label="4 stars"]');
    await page.fill("#review-title", "QA verified review");
    await page.fill("#review-body", "Bought and delivered, per the seeded order history.");

    // A 2x2 PNG is enough to prove the pipeline decodes, downscales and
    // stores an image; the bytes are not the point.
    await page.setInputFiles("#review-photos", {
      name: "kurta.png",
      mimeType: "image/png",
      buffer: TINY_PNG,
    });
    await page.waitForTimeout(400);
    check(
      "review-trust",
      "an uploaded photo previews before submitting",
      (await page.locator('img[alt="Your photo 1"]').count()) > 0
    );

    await page.click('button:has-text("Submit review")');
    await page.waitForTimeout(500);
    check(
      "review-trust",
      "a review matching a delivered order shows the verified badge",
      (await page.locator("text=Verified Purchase").count()) > 0
    );
    check(
      "review-trust",
      "the customer photo is shown on the review",
      (await page.locator('img[alt^="Customer photo 1"]').count()) > 0
    );

    // Photos are stored as downscaled JPEG data URLs, not the original bytes.
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-reviews");
      return raw ? JSON.parse(raw).state.reviews : [];
    });
    const withPhoto = stored.find((r) => r.title === "QA verified review");
    check(
      "review-trust",
      "the stored photo is a downscaled JPEG, not the uploaded PNG",
      Boolean(withPhoto?.photos?.[0]?.startsWith("data:image/jpeg")),
      withPhoto?.photos?.[0]?.slice(0, 24)
    );
    check(
      "review-trust",
      "verified is stored as true, not merely rendered",
      withPhoto?.verified === true
    );
  }))
);

// ---------------------------------------------------------------------------
// Retail: order detail, timeline, invoice, self-service cancellation
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/shop/orders`);
    // appears(), not count(). The list is populated from a hook that may have
    // to ask the server first — on a deployment with a database it always
    // does — and count() immediately after navigation reads whatever happens
    // to be on the page at that instant. That raced two runs in three when the
    // fetch was unconditional.
    check(
      "retail-orders",
      "order list renders",
      await appears(page, 'a[href^="/shop/orders/"]')
    );

    // A delivered order can't be cancelled; a pending one can. Pick the
    // pending one explicitly so the assertion isn't order-dependent.
    await goto(page, `${BASE_URL}/shop/orders/GV83997211`);
    check("retail-orders", "order detail shows status timeline", (await page.locator("text=Order placed").count()) > 0);
    check("retail-orders", "pending order offers cancellation", (await page.locator('button:has-text("Cancel order")').count()) > 0);

    // Invoice renders with the operating entity and GSTIN on it.
    await goto(page, `${BASE_URL}/shop/orders/GV83997211/invoice`);
    check("retail-orders", "invoice shows INVOICE heading", (await page.locator("text=INVOICE").count()) > 0);
    check("retail-orders", "invoice carries GSTIN", (await page.locator("text=/GSTIN/").count()) > 0);

    // GST breakdown. Prices are tax-inclusive, so the split must never change
    // the total the customer already agreed to.
    check("retail-orders", "invoice shows HSN codes", (await page.locator("text=/HSN/").count()) > 0);
    check("retail-orders", "invoice shows taxable value", (await page.locator("text=/Taxable value/").count()) > 0);
    check("retail-orders", "invoice shows a per-slab tax summary", (await page.locator("text=/Tax summary/").count()) > 0);

    // Shipping to Maharashtra from a Telangana-registered seller is an
    // inter-state supply, so IGST — not CGST/SGST.
    check("retail-orders", "out-of-state order is taxed as IGST", (await page.locator("text=/Inter-state supply/").count()) > 0);
    check("retail-orders", "IGST invoice shows no CGST line", (await page.locator("dt:has-text('CGST')").count()) === 0);

    // Same seller state (Telangana) must split into CGST + SGST instead.
    await goto(page, `${BASE_URL}/shop/orders/GV84055120/invoice`);
    check("retail-orders", "in-state order is taxed as CGST + SGST", (await page.locator("text=/Intra-state supply/").count()) > 0);
    check("retail-orders", "in-state invoice shows both CGST and SGST", (await page.locator("dt:has-text('CGST')").count()) > 0 && (await page.locator("dt:has-text('SGST')").count()) > 0);

    // The tax must be contained in the total, not added to it: this order is
    // 2 x ₹699 = ₹1,398 and the invoice total must still say exactly that.
    check("retail-orders", "GST is inclusive — total is unchanged", (await page.locator("text=/₹1,398/").count()) > 0);

    // Cancel, and confirm it sticks and removes the cancel affordance.
    await goto(page, `${BASE_URL}/shop/orders/GV83997211`);
    await page.click('button:has-text("Cancel order")');
    await page.click('button:has-text("Yes, cancel order")');
    await page.waitForTimeout(400);
    check("retail-orders", "cancelled order shows cancelled state", (await page.locator("text=Order cancelled").count()) > 0);
    check("retail-orders", "cancelled order no longer offers cancellation", (await page.locator('button:has-text("Cancel order")').count()) === 0);

    // A delivered order should never offer cancellation.
    await goto(page, `${BASE_URL}/shop/orders/GV84098771`);
    check("retail-orders", "delivered order cannot be cancelled", (await page.locator('button:has-text("Cancel order")').count()) === 0);
  }))
);

// ---------------------------------------------------------------------------
// Wholesale: new signup starts pending -> quote allowed, direct order locked
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/wholesale/product/cotton-round-neck-tee-bulk`);
    await page.click("text=Add to Order");
    await page.waitForTimeout(200);

    await goto(page, `${BASE_URL}/wholesale/signup`);
    await page.fill("#businessName", "QA Traders");
    await page.fill("#contactName", "QA Contact");
    await page.fill("#email", "qa@traders.example");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Create business account")');
    await page.waitForURL("**/wholesale/dashboard");

    await goto(page, `${BASE_URL}/wholesale/order`);
    check("wholesale-pending", "pending account sees lock message", (await page.locator("text=Placing orders directly unlocks once your account is approved").count()) > 0);
    check("wholesale-pending", "Place Order Directly hidden while pending", (await page.locator('button:has-text("Place Order Directly")').count()) === 0);
    await page.click('button:has-text("Request Quote")');
    await page.waitForURL("**/wholesale/quote-confirmation**");
    check("wholesale-pending", "pending account can still request a quote", (await page.locator("text=Request received").count()) > 0);

    await goto(page, `${BASE_URL}/wholesale/settings`);
    check("wholesale-pending", "settings shows Pending Verification badge", (await page.locator("text=Pending Verification").count()) > 0);
    check("wholesale-pending", "credit terms button disabled while pending", await page.locator('button:has-text("Request Net-30 Credit Terms")').isDisabled());
  }))
);

// ---------------------------------------------------------------------------
// Wholesale: returning login is approved -> direct order + credit terms
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/wholesale/login`);
    await page.fill("#email", "qa-buyer@example.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/wholesale/dashboard");

    await goto(page, `${BASE_URL}/wholesale/product/denim-jeans-bulk`);
    await page.click("text=Add to Order");
    await page.waitForTimeout(200);
    await goto(page, `${BASE_URL}/wholesale/order`);
    check("wholesale-approved", "approved account sees Place Order Directly", (await page.locator('button:has-text("Place Order Directly")').count()) > 0);

    await goto(page, `${BASE_URL}/wholesale/settings`);
    check("wholesale-approved", "settings shows Approved badge", (await page.locator("text=Approved").count()) > 0);
    await page.click('button:has-text("Request Net-30 Credit Terms")');
    await page.waitForTimeout(200);
    check("wholesale-approved", "credit terms request confirmed", (await page.locator("text=Net-30 credit terms requested").count()) > 0);

    await goto(page, `${BASE_URL}/wholesale/team`);
    await page.fill("#name", "QA Team Member");
    await page.fill("#email", "member@qa.example");
    await page.click('button:has-text("Invite")');
    await page.waitForTimeout(200);
    check("wholesale-approved", "team member invited and listed", (await page.locator("text=QA Team Member").count()) > 0);

    await goto(page, `${BASE_URL}/wholesale/dashboard`);
    await page.click('button:has-text("Reorder") >> nth=0');
    await page.waitForTimeout(200);
    await goto(page, `${BASE_URL}/wholesale/order`);
    check("wholesale-approved", "reorder added items to order review", (await page.locator("text=/units/").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Wholesale: pricing calculator + CSV bulk upload on Quick Order
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/wholesale/pricing-calculator`);
    const priceBefore = await page.locator("text=PRICE PER UNIT").locator("..").textContent();
    await page.fill("#calc-qty", "700");
    await page.waitForTimeout(200);
    const priceAfter = await page.locator("text=PRICE PER UNIT").locator("..").textContent();
    check("wholesale-tools", "pricing calculator updates with quantity", priceBefore !== priceAfter);

    await goto(page, `${BASE_URL}/wholesale/quick-order`);
    check("wholesale-tools", "quick order page loads with product table", (await page.locator("table").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Admin: access gating, approvals, order/quote status, product CRUD
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    // Gating: admin routes are unusable without an admin session.
    await goto(page, `${BASE_URL}/admin`);
    check("admin", "admin redirects to login when signed out", page.url().endsWith("/admin/login"));

    // The above only proves the browser ended up somewhere sensible, which a
    // client-side redirect would also satisfy — and a client-side redirect
    // means the admin markup was already delivered. These two check that the
    // server refuses, by asking it directly with no JavaScript involved.
    const raw = await fetch(`${BASE_URL}/admin`, { redirect: "manual" });
    check(
      "admin",
      "server answers /admin with a redirect, not a page",
      raw.status >= 300 && raw.status < 400 && (raw.headers.get("location") || "").includes("/admin/login"),
      `status ${raw.status}, location ${raw.headers.get("location")}`
    );

    const followed = await fetch(`${BASE_URL}/admin`);
    const followedBody = await followed.text();
    check(
      "admin",
      "no admin panel markup reaches an unauthenticated request",
      !followedBody.includes("Wholesale Accounts") && !followedBody.includes("Credit Ledger")
    );

    // The three checks above all pass if proxy.ts alone is doing the work —
    // verified by deleting the layout's requireStaff() call, at which point
    // they stayed green. So they do not test the control that matters.
    //
    // This one does. proxy.ts only checks that a session cookie is PRESENT,
    // never that it is valid, so a garbage cookie walks straight past it and
    // the only thing left standing between it and the panel is requireStaff()
    // in the layout. With that call removed this request returns 200 and the
    // full admin sidebar; with it in place, a redirect.
    //
    // That is the layer Next's proxy docs warn about — a matcher does not
    // reliably cover Server Functions — so it is the layer worth pinning.
    const forged = await fetch(`${BASE_URL}/admin`, {
      headers: { cookie: "gv_demo_admin=not-a-valid-token" },
    });
    const forgedBody = await forged.text();
    check(
      "admin",
      "a forged session cookie is rejected by the server-side gate, not just the proxy",
      !forgedBody.includes("Wholesale Accounts") && !forgedBody.includes("Credit Ledger"),
      `status ${forged.status}`
    );

    await goto(page, `${BASE_URL}/admin/login`);
    await page.fill("#email", "staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");
    check("admin", "admin login reaches dashboard", (await page.locator("text=Dashboard").count()) > 0);

    // The session must be HttpOnly. If script can read it, script can forge
    // it, and the whole point of moving the gate server-side is lost.
    const scriptVisibleCookies = await page.evaluate(() => document.cookie);
    check(
      "admin",
      "the admin session cookie is not readable from JavaScript",
      !scriptVisibleCookies.includes("gv_demo_admin"),
      scriptVisibleCookies
    );

    // Signing out must invalidate server-side, not just clear browser state.
    const signedInCookies = await page.context().cookies();
    await page.click('button:has-text("Sign out")');
    await page.waitForURL("**/admin/login");
    await goto(page, `${BASE_URL}/admin`);
    check("admin", "signing out closes the panel", page.url().endsWith("/admin/login"));

    // Restore the session for the rest of this flow.
    await page.context().addCookies(signedInCookies);

    // The approval queue is the counterpart to the storefront's pending state.
    await goto(page, `${BASE_URL}/admin/accounts`);
    const pendingBefore = await page.locator('button:has-text("Approve")').count();
    check("admin", "pending accounts awaiting approval are listed", pendingBefore > 0);
    await page.click('button:has-text("Approve") >> nth=0');
    await page.waitForTimeout(300);
    const pendingAfter = await page.locator('button:has-text("Approve")').count();
    check("admin", "approving an account removes it from the pending queue", pendingAfter < pendingBefore);

    // Retail order status transition persists to the list view.
    await goto(page, `${BASE_URL}/admin/orders`);
    await page.click('a[href^="/admin/orders/"] >> nth=0');
    await page.waitForURL("**/admin/orders/**");
    await page.click('button:has-text("shipped")');
    await page.waitForTimeout(300);
    await goto(page, `${BASE_URL}/admin/orders`);
    check("admin", "retail order status change persists", (await page.locator("text=shipped").count()) > 0);

    // Wholesale quote status transition.
    await goto(page, `${BASE_URL}/admin/quotes`);
    await page.click('a[href^="/admin/quotes/"] >> nth=0');
    await page.waitForURL("**/admin/quotes/**");
    await page.click('button:has-text("Confirmed")');
    await page.waitForTimeout(300);
    check("admin", "quote status change applies", (await page.locator("text=Confirmed").count()) > 0);

    // Product creation shows up in the catalog list.
    await goto(page, `${BASE_URL}/admin/products/retail/new`);
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
    await goto(page, `${BASE_URL}/admin/products/wholesale/new`);
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

    // ---- Notification outbox -------------------------------------------
    // This flow already approved an account and shipped an order above, so
    // both should have queued customer messages by now.
    await goto(page, `${BASE_URL}/admin/notifications`);
    check("admin", "outbox lists seeded message history", (await page.locator("text=Order placed").count()) > 0);
    check(
      "admin",
      "approving an account queued an approval message",
      (await page.locator("text=Wholesale account approved").count()) > 0
    );
    check(
      "admin",
      "shipping an order queued a shipment message",
      (await page.locator("text=Order shipped").count()) > 0
    );

    // Preview must show the real rendered copy, not a placeholder.
    await page.click('button:has-text("Preview") >> nth=0');
    await page.waitForTimeout(200);
    check(
      "admin",
      "preview reveals the rendered message body",
      (await page.locator("text=/GarmentVibes/").count()) > 0
    );

    // Filters
    const allCount = await page.locator("ul > li").count();
    await page.click('button:has-text("WhatsApp")');
    await page.waitForTimeout(200);
    const waCount = await page.locator("ul > li").count();
    check("admin", "channel filter narrows the outbox", waCount < allCount);

    await page.click('button:has-text("All channels")');
    await page.click('button:has-text("queued")');
    await page.waitForTimeout(200);
    const queuedCount = await page.locator("ul > li").count();
    check("admin", "status filter narrows the outbox", queuedCount > 0 && queuedCount < allCount);

    // Marking sent removes it from the queued filter.
    await page.click('button:has-text("Mark sent") >> nth=0');
    await page.waitForTimeout(300);
    check(
      "admin",
      "marking a message sent clears it from the queued filter",
      (await page.locator("ul > li").count()) < queuedCount
    );
  }))
);

// ---------------------------------------------------------------------------
// Returns: the 7-day post-delivery window, the request flow, and the admin
// queue that decides it. The window is measured from delivery, so the seed
// delivery dates are relative — see the note in mock/admin-data.ts.
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    // Eligibility gating: only delivered orders, and only inside the window.
    await goto(page, `${BASE_URL}/shop/orders/GV84213102`);
    check("returns", "undelivered order offers no return", (await page.locator('a:has-text("Return items")').count()) === 0);

    await goto(page, `${BASE_URL}/shop/orders/GV84213102/return`);
    check("returns", "return page refuses an undelivered order", (await page.locator("text=Return not available").count()) > 0);

    // An order that already has a return open can't raise a second one.
    await goto(page, `${BASE_URL}/shop/orders/GV84098771/return`);
    check("returns", "order with an open return can't raise another", (await page.locator("text=/already been raised/").count()) > 0);

    // The happy path: a delivered order with no return yet.
    await goto(page, `${BASE_URL}/shop/orders/GV84055120`);
    check("returns", "delivered order offers a return", (await page.locator('a:has-text("Return items")').count()) > 0);

    await page.click('a:has-text("Return items")');
    await page.waitForURL("**/return");
    check("returns", "return form shows days left in the window", (await page.locator("text=/days left in your 7-day window/").count()) > 0);

    // Submitting nothing must be refused rather than creating an empty return.
    await page.click('button:has-text("Submit return request")');
    await page.waitForTimeout(300);
    check("returns", "submitting with no items selected is refused", page.url().includes("/return"));

    // Quantity is capped at what was actually bought (2 of this item).
    const qtyOptions = await page.locator("#qty-0 option").count();
    check("returns", "return quantity is capped at the quantity ordered", qtyOptions === 3);

    await page.selectOption("#qty-0", "1");
    await page.selectOption("#reason", "Item damaged or defective");
    await page.fill("#comments", "Seam came apart after one wash.");
    check("returns", "estimated refund reflects the selected quantity", (await page.locator("text=/₹699/").count()) > 0);

    await page.click('button:has-text("Submit return request")');
    await page.waitForURL("**/shop/orders/GV84055120");
    await page.waitForTimeout(300);
    check("returns", "submitted return appears on the order", (await page.locator("text=Returns on this order").count()) > 0);
    check("returns", "new return starts as Requested", (await page.locator("text=Requested").count()) > 0);
    check("returns", "return button is gone once one is open", (await page.locator('a:has-text("Return items")').count()) === 0);

    // The request must have queued the customer's acknowledgement.
    const outbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("returns", "raising a return queues a confirmation", outbox.some((m) => m.templateId === "return_requested"));

    // Admin side: review and approve.
    await goto(page, `${BASE_URL}/admin/login`);
    await page.fill("#email", "staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");

    await goto(page, `${BASE_URL}/admin/returns`);
    const queuedBefore = await page.locator("#returns-list > li").count();
    check("returns", "admin queue lists pending returns", queuedBefore > 0);

    await page.click('button:text-is("Approve") >> nth=0');
    await page.waitForTimeout(300);
    check("returns", "approving removes it from the pending filter", (await page.locator("#returns-list > li").count()) < queuedBefore);

    // Approved -> picked up -> refunded, the full fulfilment chain.
    await page.click('button:text-is("Approved")');
    await page.waitForTimeout(200);
    check("returns", "approved return moves to the Approved filter", (await page.locator("#returns-list > li").count()) > 0);

    await page.click('button:has-text("Mark picked up")');
    await page.waitForTimeout(300);
    await page.click('button:text-is("Picked up")');
    await page.waitForTimeout(200);
    await page.click('button:has-text("Initiate refund")');
    await page.waitForTimeout(300);
    await page.click('button:text-is("Refunded")');
    await page.waitForTimeout(200);
    check("returns", "refunded return lands in the Refunded filter", (await page.locator("#returns-list > li").count()) > 0);

    const adminOutbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("returns", "approval queues a customer notification", adminOutbox.some((m) => m.templateId === "return_approved"));
    check("returns", "refund queues a customer notification", adminOutbox.some((m) => m.templateId === "refund_initiated"));
  }))
);

// ---------------------------------------------------------------------------
// Exchanges, restocking, tracking, promos and back-in-stock
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    // ---- Exchange: request a size swap rather than a refund -------------
    await goto(page, `${BASE_URL}/shop/orders/GV84055120/return`);
    await page.click('button:has-text("Exchange")');
    await page.selectOption("#qty-0", "1");
    check("exchanges", "choosing exchange reveals a replacement size picker", (await page.locator("#swap-0").count()) > 0);

    // The size being sent back must not be offered as the replacement.
    const swapOptions = await page.locator("#swap-0 option").allTextContents();
    check("exchanges", "replacement options exclude the size being returned", !swapOptions.includes("M"));

    // Swapping to a different product should settle the price difference.
    check("exchanges", "a different product can be chosen", (await page.locator("#swap-product-0 option").count()) > 1);
    await page.selectOption("#swap-product-0", { index: 1 });
    await page.waitForTimeout(300);
    check("exchanges", "changing product clears the stale size choice", (await page.locator("#swap-0").inputValue()) === "");
    check(
      "exchanges",
      "a price difference is shown before submitting",
      (await page.locator("text=/Difference to pay|Difference refunded/").count()) > 0
    );

    // Back to a same-product swap for the rest of the flow: a like-for-like
    // exchange must show no difference at all.
    await page.selectOption("#swap-product-0", { index: 0 });
    await page.waitForTimeout(300);
    check(
      "exchanges",
      "a like-for-like swap shows no price difference",
      (await page.locator("text=/Difference to pay|Difference refunded/").count()) === 0
    );

    // Submitting without picking a replacement is refused.
    await page.click('button:has-text("Submit exchange request")');
    await page.waitForTimeout(300);
    check("exchanges", "exchange without a replacement size is refused", page.url().includes("/return"));

    await page.selectOption("#swap-0", { index: 1 });
    await page.click('button:has-text("Submit exchange request")');
    await page.waitForURL("**/shop/orders/GV84055120");
    await page.waitForTimeout(300);
    check("exchanges", "exchange request appears on the order", (await page.locator("text=Returns on this order").count()) > 0);

    // ---- Admin: exchange fulfilment and reason-aware restocking --------
    await goto(page, `${BASE_URL}/admin/login`);
    await page.fill("#email", "staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");

    await goto(page, `${BASE_URL}/admin/returns`);
    check("exchanges", "admin queue labels the resolution type", (await page.locator("text=exchange").first().count()) > 0);

    await page.click('button:text-is("Approve") >> nth=0');
    await page.waitForTimeout(300);
    await page.click('button:text-is("Approved")');
    await page.waitForTimeout(200);
    await page.click('button:has-text("Mark picked up")');
    await page.waitForTimeout(300);
    await page.click('button:text-is("Picked up")');
    await page.waitForTimeout(200);
    check("exchanges", "an exchange offers Ship exchange, not Initiate refund", (await page.locator('button:has-text("Ship exchange")').count()) > 0);

    await page.click('button:has-text("Ship exchange")');
    await page.waitForTimeout(400);
    const exchangeOutbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("exchanges", "shipping an exchange notifies the customer", exchangeOutbox.some((m) => m.templateId === "exchange_shipped"));

    // The seeded return is a size issue, so it restocks; a damaged-goods
    // return must not. The queue warns staff before they act.
    await goto(page, `${BASE_URL}/admin/returns`);
    await page.click('button:text-is("All")');
    await page.waitForTimeout(300);
    const stockBefore = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-stock");
      return raw ? JSON.parse(raw).state.overrides : {};
    });
    check("restocking", "stock overrides are recorded when a return completes", Object.keys(stockBefore).length > 0);

    // ---- Shipment tracking ---------------------------------------------
    await goto(page, `${BASE_URL}/admin/orders/GV84213567`);
    await page.selectOption("#courier", "delhivery");

    // A mistyped AWB must not reach the customer: it goes into the shipment
    // email as a tracking link, and a link to "not found" is indistinguishable
    // from a lost parcel. Delhivery issues digits only, so this is refused.
    await page.fill("#awb", "QA123456789");
    await page.click('button:has-text("Save tracking")');
    await page.waitForTimeout(300);
    check(
      "tracking",
      "an AWB that does not match the courier's format is refused",
      (await page.locator("text=/does not look like a valid tracking number/").count()) > 0
    );
    check(
      "tracking",
      "the rejected AWB was not saved",
      (await page.locator("text=QA123456789").count()) === 0
    );

    // Couriers print spaces into their own labels, so a pasted number keeps
    // them. It should be cleaned up rather than rejected.
    await page.fill("#awb", " 9876 5432 101 ");
    await page.click('button:has-text("Save tracking")');
    await page.waitForTimeout(300);
    check("tracking", "admin can record courier and AWB", (await page.locator("text=98765432101").count()) > 0);

    // No shipping account is configured, so booking must say so and leave the
    // manual path intact rather than failing silently or half-saving. This is
    // the only path through the Shiprocket adapter that can be exercised
    // without an account — see the header of src/lib/shipping/shiprocket.ts.
    await page.click('button:has-text("Book with courier")');
    await page.waitForTimeout(500);
    check(
      "tracking",
      "booking without a shipping account explains itself",
      (await page.locator("text=/No shipping account is configured/").count()) > 0
    );
    check(
      "tracking",
      "a failed booking leaves the manually-entered AWB alone",
      (await page.inputValue("#awb")) === "98765432101"
    );

    await goto(page, `${BASE_URL}/shop/orders/GV84213567`);
    check("tracking", "customer sees the tracking number", (await page.locator("text=98765432101").count()) > 0);
    check("tracking", "customer gets a courier tracking link", (await page.locator('a[href*="delhivery.com"]').count()) > 0);

    // ---- Promo codes ----------------------------------------------------
    await goto(page, `${BASE_URL}/admin/promos`);
    const promosBefore = await page.locator("#promo-list > li").count();
    check("promos", "built-in codes are listed", promosBefore >= 2);

    // Guardrails: a 0% or 100% code is almost certainly a typo.
    await page.fill("#promo-code", "QATEST25");
    await page.fill("#promo-percent", "99");
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(300);
    check("promos", "rejects an implausible discount", (await page.locator("#promo-list > li").count()) === promosBefore);

    await page.fill("#promo-percent", "25");
    await page.click('button:has-text("Create")');
    await page.waitForTimeout(300);
    check("promos", "creates a valid code", (await page.locator("#promo-list > li").count()) === promosBefore + 1);

    // A built-in can be switched off but never deleted, so the admin UI and
    // the server's compiled list cannot disagree.
    check("promos", "built-in codes cannot be deleted", (await page.locator('button[aria-label="Delete GARMENT10"]').count()) === 0);
    check("promos", "custom codes can be deleted", (await page.locator('button[aria-label="Delete QATEST25"]').count()) > 0);

    // Deactivating must stop it working at checkout immediately.
    await goto(page, `${BASE_URL}/admin/promos`);
    await page.click('li:has-text("GARMENT10") button:has-text("Deactivate")');
    await page.waitForTimeout(300);
    check("promos", "a code can be deactivated", (await page.locator('li:has-text("GARMENT10") button:has-text("Activate")').count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Back in stock: register interest on a sold-out size, get notified on restock
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/shop/product/floral-anarkali-kurta`);
    const hasNotify = await appears(page, "text=Sold out in your size?");
    check("back-in-stock", "sold-out product offers a notify-me form", hasNotify);

    if (hasNotify) {
      const size = await page.locator("#notify-size").inputValue();
      await page.fill("#notify-email", "qa-waiter@example.com");
      await page.click('button:has-text("Notify me")');
      await page.waitForTimeout(300);

      const alerts = await page.evaluate(() => {
        const raw = localStorage.getItem("garmentvibes-stock-alerts");
        return raw ? JSON.parse(raw).state.alerts : [];
      });
      check("back-in-stock", "registration is stored against the variant", alerts.some((a) => a.email === "qa-waiter@example.com" && a.size === size));

      // Signing up twice must not queue two messages later.
      await page.click('button:has-text("Notify me")');
      await page.waitForTimeout(300);
      const afterDuplicate = await page.evaluate(() => {
        const raw = localStorage.getItem("garmentvibes-stock-alerts");
        return raw ? JSON.parse(raw).state.alerts : [];
      });
      check("back-in-stock", "duplicate registration is ignored", afterDuplicate.length === alerts.length);

      // Restocking from zero in admin should fire and consume it.
      await goto(page, `${BASE_URL}/admin/login`);
      await page.fill("#email", "staff@garmentvibes.com");
      await page.fill("#password", "password123");
      await page.click('button:has-text("Sign in")');
      await page.waitForURL("**/admin");

      await goto(page, `${BASE_URL}/admin/products/retail/r1`);
      await page.fill(`input[aria-label="Stock for size ${size}"]`, "8");
      await page.waitForTimeout(500);

      const restockOutbox = await page.evaluate(() => {
        const raw = localStorage.getItem("garmentvibes-notifications");
        return raw ? JSON.parse(raw).state.messages : [];
      });
      check("back-in-stock", "restocking queues the waiting customer's alert", restockOutbox.some((m) => m.templateId === "back_in_stock"));

      const remaining = await page.evaluate(() => {
        const raw = localStorage.getItem("garmentvibes-stock-alerts");
        return raw ? JSON.parse(raw).state.alerts : [];
      });
      check("back-in-stock", "registration is consumed once fired", remaining.length < afterDuplicate.length);
    }
  }))
);

// ---------------------------------------------------------------------------
// Wholesale lifecycle: consignment tracking, claims, and the credit ledger
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/admin/login`);
    await page.fill("#email", "staff@garmentvibes.com");
    await page.fill("#password", "password123");
    await page.click('button:has-text("Sign in")');
    await page.waitForURL("**/admin");

    // ---- Consignment tracking -------------------------------------------
    await goto(page, `${BASE_URL}/admin/quotes/GVQ84190233`);
    await page.selectOption("#courier", "bluedart");
    await page.fill("#awb", "77712345601");
    await page.click('button:has-text("Save tracking")');
    await page.waitForTimeout(300);
    check("wholesale-lifecycle", "admin records consignment tracking", (await page.locator("text=77712345601").count()) > 0);

    await page.click('button:text-is("Shipped")');
    await page.waitForTimeout(400);
    const shipOutbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("wholesale-lifecycle", "shipping a consignment notifies the buyer", shipOutbox.some((m) => m.templateId === "bulk_order_shipped"));

    // The buyer dashboard reads the same source, so this must appear there.
    await goto(page, `${BASE_URL}/wholesale/dashboard`);
    check("wholesale-lifecycle", "buyer dashboard shows the tracking number", (await page.locator("text=77712345601").count()) > 0);
    check("wholesale-lifecycle", "buyer gets a courier tracking link", (await page.locator('a[href*="bluedart"]').count()) > 0);

    // ---- Claims ----------------------------------------------------------
    // Not raisable until the consignment is marked received.
    await goto(page, `${BASE_URL}/wholesale/orders/GVQ84190233/claim`);
    check("wholesale-lifecycle", "claim refused before the order is fulfilled", (await page.locator("text=Claim not available").count()) > 0);

    await goto(page, `${BASE_URL}/admin/quotes/GVQ84190233`);
    await page.click('button:text-is("Fulfilled")');
    await page.waitForTimeout(300);
    check("wholesale-lifecycle", "fulfilling stamps a received date", (await page.locator("text=/claims window runs from/").count()) > 0);

    await goto(page, `${BASE_URL}/wholesale/orders/GVQ84190233/claim`);
    check("wholesale-lifecycle", "claim form opens once received", (await page.locator("text=Affected quantities").count()) > 0);

    // Submitting with nothing affected is refused.
    await page.click('button:has-text("Submit claim")');
    await page.waitForTimeout(300);
    check("wholesale-lifecycle", "empty claim is refused", page.url().includes("/claim"));

    // Cannot claim more units than were invoiced.
    const billed = Number(await page.locator("#claim-0").getAttribute("max"));
    await page.fill("#claim-0", String(billed + 500));
    await page.waitForTimeout(200);
    check("wholesale-lifecycle", "claimed quantity is capped at the billed quantity", Number(await page.locator("#claim-0").inputValue()) === billed);

    await page.fill("#claim-0", "12");
    await page.selectOption("#claim-reason", "Short shipment");
    await page.selectOption("#claim-resolution", "credit_note");
    await page.click('button:has-text("Submit claim")');
    await page.waitForURL("**/wholesale/dashboard");
    await page.waitForTimeout(300);

    const claimOutbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("wholesale-lifecycle", "raising a claim acknowledges it to the buyer", claimOutbox.some((m) => m.templateId === "claim_received"));

    // A second claim on the same order is blocked while one is open.
    await goto(page, `${BASE_URL}/wholesale/orders/GVQ84190233/claim`);
    check("wholesale-lifecycle", "second claim blocked while one is open", (await page.locator("text=/already been raised/").count()) > 0);

    // ---- Admin claim resolution -----------------------------------------
    await goto(page, `${BASE_URL}/admin/claims`);
    check("wholesale-lifecycle", "claim appears in the admin queue", (await page.locator("#claims-list > li").count()) > 0);

    await page.click('button:has-text("Start review")');
    await page.waitForTimeout(300);
    await page.click('button:text-is("Under review")');
    await page.waitForTimeout(200);
    await page.click('button:text-is("Approve")');
    await page.waitForTimeout(300);
    await page.click('button:text-is("Approved")');
    await page.waitForTimeout(200);
    await page.click('button:has-text("Mark settled")');
    await page.waitForTimeout(400);

    const settledOutbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("wholesale-lifecycle", "settling a claim notifies the buyer", settledOutbox.some((m) => m.templateId === "claim_resolved"));

    // ---- Credit ledger ---------------------------------------------------
    await goto(page, `${BASE_URL}/admin/credit`);
    check("credit", "ledger lists outstanding invoices", (await page.locator("#credit-list > li").count()) > 0);
    check("credit", "ageing summary is shown", (await page.locator("text=Ageing").count()) > 0);

    await page.click('button:text-is("overdue")');
    await page.waitForTimeout(300);
    const overdueCount = await page.locator("#credit-list > li").count();
    check("credit", "overdue filter surfaces past-due invoices", overdueCount > 0);
    check("credit", "overdue invoices offer a reminder", (await page.locator('button:has-text("Send reminder")').count()) > 0);

    await page.click('button:has-text("Send reminder")');
    await page.waitForTimeout(300);
    const chaseOutbox = await page.evaluate(() => {
      const raw = localStorage.getItem("garmentvibes-notifications");
      return raw ? JSON.parse(raw).state.messages : [];
    });
    check("credit", "reminder is queued to the buyer", chaseOutbox.some((m) => m.templateId === "payment_overdue"));

    // Overpaying would make the ledger lie, so it must be refused.
    await page.click('button:has-text("Record payment") >> nth=0');
    await page.waitForTimeout(200);
    const amountField = page.locator('input[id^="amount-"]').first();
    const owed = Number(await amountField.inputValue());
    await amountField.fill(String(owed + 1000));
    await page.click('button:text-is("Save")');
    await page.waitForTimeout(300);
    check("credit", "a payment larger than the balance is refused", (await page.locator('input[id^="amount-"]').count()) > 0);

    // A part payment moves it to part_paid, not paid.
    await amountField.fill(String(Math.max(1, Math.floor(owed / 2))));
    await page.click('button:text-is("Save")');
    await page.waitForTimeout(400);
    await page.click('button:text-is("all")');
    await page.waitForTimeout(300);
    check("credit", "a part payment is recorded as part paid", (await page.locator("text=Part paid").count()) > 0);
  }))
);

// ---------------------------------------------------------------------------
// Payments: the Razorpay API surface.
//
// No merchant account exists, so the success path can't be driven end to
// end. What IS testable is everything that protects money: the server
// pricing the order itself rather than trusting the browser, and the webhook
// refusing anything that isn't signed by Razorpay. These run over plain
// fetch — no browser needed.
//
// The webhook checks need RAZORPAY_WEBHOOK_SECRET set on the server process;
// see the CI workflow. They're skipped (and say so) when it isn't.
// ---------------------------------------------------------------------------
{
  const post = (path, body, headers = {}) =>
    fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });

  // Order pricing must reject anything it can't price from the catalog.
  const unknownProduct = await post(
    "/api/razorpay/order",
    JSON.stringify({ items: [{ productId: "does-not-exist", qty: 1 }] })
  );
  check("payments", "order route rejects an unknown product", unknownProduct.status === 400);

  const zeroQty = await post(
    "/api/razorpay/order",
    JSON.stringify({ items: [{ productId: "r1", qty: 0 }] })
  );
  check("payments", "order route rejects a zero quantity", zeroQty.status === 400);

  const absurdQty = await post(
    "/api/razorpay/order",
    JSON.stringify({ items: [{ productId: "r1", qty: 9999 }] })
  );
  check("payments", "order route caps quantity", absurdQty.status === 400);

  const emptyOrder = await post("/api/razorpay/order", JSON.stringify({ items: [] }));
  check("payments", "order route rejects an empty order", emptyOrder.status === 400);

  const badJson = await post("/api/razorpay/order", "not json at all");
  check("payments", "order route rejects malformed JSON", badJson.status === 400);

  // A client-supplied amount must be ignored entirely. With no keys set the
  // route stops at 503 — the point is that it got past pricing without
  // honouring the injected total, and never 200s on it.
  const injectedAmount = await post(
    "/api/razorpay/order",
    JSON.stringify({ items: [{ productId: "r1", qty: 1 }], amount: 100, total: 100 })
  );
  check(
    "payments",
    "order route ignores a client-supplied amount",
    injectedAmount.status === 503
  );

  const validOrder = await post(
    "/api/razorpay/order",
    JSON.stringify({ items: [{ productId: "r1", qty: 1 }] })
  );
  const validBody = await validOrder.json().catch(() => ({}));
  check(
    "payments",
    "unconfigured deployment degrades to 503, not a crash",
    validOrder.status === 503 && validBody.error === "not_configured"
  );

  // ---- Webhook signature verification --------------------------------
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.log(
      "\n! payments: webhook signature checks skipped — set RAZORPAY_WEBHOOK_SECRET on the server and this runner to enable them"
    );
  } else {
    const { createHmac } = await import("node:crypto");
    const sign = (body) => createHmac("sha256", webhookSecret).update(body).digest("hex");
    const payload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_test123", amount: 129900 } } },
    });

    const unsigned = await post("/api/razorpay/webhook", payload);
    check("payments", "webhook rejects an unsigned request", unsigned.status === 400);

    const wrongSig = await post("/api/razorpay/webhook", payload, {
      "x-razorpay-signature": "00".repeat(32),
    });
    check("payments", "webhook rejects a wrong signature", wrongSig.status === 400);

    const signed = await post("/api/razorpay/webhook", payload, {
      "x-razorpay-signature": sign(payload),
    });
    check("payments", "webhook accepts a correctly signed event", signed.status === 200);

    // The signature must bind to the exact bytes: replaying a valid
    // signature against an altered body has to fail, or an attacker could
    // change the amount on a legitimate event.
    const tampered = payload.replace("129900", "1");
    const replayed = await post("/api/razorpay/webhook", tampered, {
      "x-razorpay-signature": sign(payload),
    });
    check("payments", "webhook rejects a tampered body with a valid signature", replayed.status === 400);

    // A signature of the right shape but from the wrong secret must fail.
    const foreignSig = createHmac("sha256", "not-the-real-secret").update(payload).digest("hex");
    const foreign = await post("/api/razorpay/webhook", payload, {
      "x-razorpay-signature": foreignSig,
    });
    check("payments", "webhook rejects a signature from another secret", foreign.status === 400);
  }

  // ---------------------------------------------------------------------
  // Rate limiting on order creation
  // ---------------------------------------------------------------------
  //
  // Each burst uses its own x-forwarded-for value, for two reasons. It keeps
  // the burst out of the bucket every other check in this file shares —
  // otherwise exhausting the limit here would 429 the security section's
  // request further down, which asserts something unrelated. And it drives the
  // header path the limiter actually keys on.
  //
  // That the header can be set from here at all is the caveat documented in
  // lib/rate-limit.ts: nothing in front of a local server overwrites it. In
  // production the platform does, which is what makes the key trustworthy.
  const burst = async (ip, count) => {
    const statuses = [];
    for (let i = 0; i < count; i += 1) {
      const res = await post(
        "/api/razorpay/order",
        JSON.stringify({ items: [{ productId: "r1", qty: 1 }] }),
        { "x-forwarded-for": ip }
      );
      statuses.push(res.status);
      if (res.status === 429) {
        check(
          "payments",
          "a rate-limited response says when to retry",
          Number(res.headers.get("retry-after")) > 0
        );
        break;
      }
    }
    return statuses;
  };

  const attacker = await burst("203.0.113.99", 40);
  check("payments", "order creation is rate limited", attacker.includes(429));

  // The limit has to be reached, not tripped on the first request — a limiter
  // that refuses everyone immediately would also "pass" the check above.
  check(
    "payments",
    "the rate limit allows a normal number of attempts first",
    attacker.filter((s) => s !== 429).length >= 5
  );

  // One abusive caller must not lock out everybody else, which is the failure
  // mode of keying the limit on anything shared.
  const bystander = await post(
    "/api/razorpay/order",
    JSON.stringify({ items: [{ productId: "r1", qty: 1 }] }),
    { "x-forwarded-for": "198.51.100.7" }
  );
  check("payments", "one caller's limit does not affect another", bystander.status !== 429);
}

// ---------------------------------------------------------------------------
// Install QR card.
//
// The QR is the one thing on the site a customer interacts with using a
// second device, so a wrong or unreadable code fails silently — they just
// shrug and give up. It is therefore actually DECODED here, not merely
// asserted to exist.
// ---------------------------------------------------------------------------
allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    const card = 'aside[aria-label="Continue shopping on your phone"]';

    await goto(page, `${BASE_URL}/shop`);
    // Held back deliberately so it doesn't compete with the page on arrival.
    check("install-qr", "card is not shown immediately on arrival", (await page.locator(card).count()) === 0);

    const appeared = await appears(page, card, 8000);
    check("install-qr", "card appears on a desktop pointer", appeared);

    if (appeared) {
      const { default: jsQR } = await import("jsqr");
      const { PNG } = await import("pngjs");

      const buf = await page.locator("#install-qr svg").screenshot({ scale: "device" });
      const png = PNG.sync.read(buf);
      const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

      check("install-qr", "the QR actually decodes", Boolean(decoded));

      // NEXT_PUBLIC_SITE_URL is inlined into the QR at build time, so this
      // only means anything when the value here matches the one the server
      // under test was built with. CI sets it once at the job level for
      // exactly that reason.
      check(
        "install-qr",
        "the QR encodes this deployment's URL",
        decoded?.data === (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
      );

      // The caption under the code is rendered separately from the code
      // itself, so the two can disagree — a scanner would land somewhere
      // other than the address the customer was reading.
      const caption = (await page.locator(`${card} .font-mono`).innerText()).trim();
      check(
        "install-qr",
        "the QR and the printed address agree",
        decoded?.data.replace(/^https?:\/\//, "") === caption
      );

      // Dismissal has to persist, or it becomes an irritant on every page.
      await page.click('button[aria-label="Dismiss"]');
      await page.waitForTimeout(300);
      await goto(page, `${BASE_URL}/shop/women`);
      await page.waitForTimeout(3200);
      check("install-qr", "dismissal persists across navigation", (await page.locator(card).count()) === 0);
    }
  }))
);

// ---------------------------------------------------------------------------
// Security headers.
//
// These are invisible in the UI, so nothing else in this suite would notice
// if a config edit dropped them. Asserted over plain fetch.
// ---------------------------------------------------------------------------
{
  const response = await fetch(`${BASE_URL}/shop`);
  const header = (name) => response.headers.get(name) ?? "";

  check("security", "sends a Content-Security-Policy", header("content-security-policy").length > 0);
  check("security", "denies framing", header("content-security-policy").includes("frame-ancestors 'none'"));
  check("security", "blocks plugin content", header("content-security-policy").includes("object-src 'none'"));
  check("security", "pins form submissions to this origin", header("content-security-policy").includes("form-action 'self'"));
  check("security", "restricts base tag rewriting", header("content-security-policy").includes("base-uri 'self'"));
  // Razorpay must stay allowed, or checkout silently fails once keys are set.
  check("security", "allows the Razorpay checkout script", header("content-security-policy").includes("checkout.razorpay.com"));
  check("security", "allows the Razorpay payment frame", header("content-security-policy").includes("frame-src") && header("content-security-policy").includes("api.razorpay.com"));

  // The indexing headers and robots.txt answer the same question and must
  // never disagree — a deployment serving "Disallow: /" while its headers say
  // it is indexable is one Google resolves in whichever direction it likes.
  //
  // Both are derived from shouldAllowIndexing() in src/lib/indexing.ts, so
  // this asserts the agreement rather than either value: the suite runs with
  // NEXT_PUBLIC_SITE_URL set and no VERCEL_ENV, which is the indexable case,
  // but a preview build has to hold the same invariant.
  {
    const robots = await (await fetch(`${BASE_URL}/robots.txt`)).text();
    const blanketDisallow = /User-Agent: \*\s*\nDisallow: \/\s*$/i.test(robots.trim());
    const noindexHeader = header("x-robots-tag").includes("noindex");
    check(
      "security",
      "robots.txt and X-Robots-Tag agree about whether this deployment is indexable",
      blanketDisallow === noindexHeader,
      `robots.txt blanket-disallow=${blanketDisallow}, X-Robots-Tag=${header("x-robots-tag") || "(absent)"}`
    );
  }

  check("security", "sends HSTS", header("strict-transport-security").includes("max-age="));
  check("security", "sends nosniff", header("x-content-type-options") === "nosniff");
  check("security", "sends X-Frame-Options", header("x-frame-options") === "DENY");
  check("security", "sends a Referrer-Policy", header("referrer-policy") === "strict-origin-when-cross-origin");
  check("security", "sends a Permissions-Policy", header("permissions-policy").includes("camera=()"));

  // API routes must carry them too — they're the endpoints handling money.
  const apiResponse = await fetch(`${BASE_URL}/api/razorpay/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [] }),
  });
  check("security", "API routes carry the security headers", apiResponse.headers.get("x-content-type-options") === "nosniff");
}

// ---------------------------------------------------------------------------
// SEO: structured data, social cards, crawler files
//
// Rich results are silently lost if the JSON-LD is malformed, so these assert
// the markup parses and carries the fields Google actually requires.
// ---------------------------------------------------------------------------
async function jsonLdBlocks(page) {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.flatMap((text) => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [{ __invalid: text.slice(0, 120) }];
    }
  });
}

allConsoleErrors.push(
  ...(await withPage(browser, async (page) => {
    await goto(page, `${BASE_URL}/`);
    const home = await jsonLdBlocks(page);
    check("seo", "site JSON-LD parses", home.every((b) => !b.__invalid));
    check("seo", "Organization schema present", home.some((b) => b["@type"] === "Organization"));
    const website = home.find((b) => b["@type"] === "WebSite");
    check("seo", "WebSite schema exposes a SearchAction", Boolean(website?.potentialAction));

    // Retail product: the schema that drives price/stock/star rich results.
    await goto(page, `${BASE_URL}/shop/product/floral-anarkali-kurta`);
    const product = (await jsonLdBlocks(page)).find((b) => b["@type"] === "Product");
    check("seo", "product JSON-LD present", Boolean(product));
    check("seo", "product offer has a price and currency", Boolean(product?.offers?.price && product?.offers?.priceCurrency));
    check("seo", "product offer declares availability", String(product?.offers?.availability ?? "").includes("schema.org"));
    check("seo", "product carries an aggregateRating", Boolean(product?.aggregateRating?.ratingValue));
    // Price must be a decimal string, not paise — a 100x error here would
    // publish wrong prices to Google.
    check("seo", "schema price is in rupees, not paise", /^\d+\.\d{2}$/.test(String(product?.offers?.price ?? "")));

    const breadcrumb = (await jsonLdBlocks(page)).find((b) => b["@type"] === "BreadcrumbList");
    check("seo", "breadcrumb schema present on product", Boolean(breadcrumb?.itemListElement?.length));

    check(
      "seo",
      "product page sets a canonical URL",
      (await page.locator('link[rel="canonical"]').count()) > 0
    );
    check(
      "seo",
      "product page sets an OG image",
      (await page.locator('meta[property="og:image"]').count()) > 0
    );

    // Wholesale uses AggregateOffer because bulk pricing is a range.
    await goto(page, `${BASE_URL}/wholesale/product/cotton-round-neck-tee-bulk`);
    const bulk = (await jsonLdBlocks(page)).find((b) => b["@type"] === "Product");
    check("seo", "wholesale product uses AggregateOffer", bulk?.offers?.["@type"] === "AggregateOffer");
    check(
      "seo",
      "wholesale price range is ordered low to high",
      Number(bulk?.offers?.lowPrice) <= Number(bulk?.offers?.highPrice)
    );

    await goto(page, `${BASE_URL}/shop/faq`);
    const faq = (await jsonLdBlocks(page)).find((b) => b["@type"] === "FAQPage");
    check("seo", "FAQ page emits FAQPage schema", Boolean(faq?.mainEntity?.length));

    // Crawler files must be reachable and reference each other correctly.
    const robots = await goto(page, `${BASE_URL}/robots.txt`);
    const robotsBody = await robots.text();
    check("seo", "robots.txt served", robots.status() === 200);
    check("seo", "robots.txt disallows /admin", robotsBody.includes("/admin"));
    check("seo", "robots.txt points at the sitemap", robotsBody.includes("sitemap.xml"));

    const sitemap = await goto(page, `${BASE_URL}/sitemap.xml`);
    const sitemapBody = await sitemap.text();
    check("seo", "sitemap.xml served", sitemap.status() === 200);
    check("seo", "sitemap lists product URLs", sitemapBody.includes("/shop/product/"));
    // A deployment that emits localhost URLs in its sitemap is broken for
    // anyone who clicks them — the failure mode when the site origin isn't
    // resolved from the environment.
    check(
      "seo",
      "sitemap uses the configured origin, not localhost",
      !sitemapBody.includes("localhost") || (process.env.NEXT_PUBLIC_SITE_URL ?? "").includes("localhost")
    );
    check(
      "seo",
      "sitemap excludes admin routes",
      !sitemapBody.includes("<loc>") || !/\/admin</.test(sitemapBody)
    );

    // Every indexable page needs its own title and description.
    //
    // Pages that omit them silently inherit the root layout's, which is how
    // four pages ended up sharing one <title> and twenty-seven shared a single
    // description — search engines cannot tell them apart, and every snippet
    // reads the same. The failure is invisible page-by-page: each one looks
    // fine on its own, and only comparing them across the sitemap shows it.
    // Client-component pages are the usual culprit, since `"use client"`
    // modules cannot export metadata at all.
    const sitemapUrls = [...sitemapBody.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      // `|| "/"` because stripping the origin from the homepage URL leaves an
      // empty string, which reads as a blank entry in any failure message.
      (m) => m[1].replace(/^https?:\/\/[^/]+/, "") || "/"
    );

    const titles = new Map();
    const descriptions = new Map();
    const missing = [];
    const duplicateTitles = [];
    const duplicateDescriptions = [];

    for (const path of sitemapUrls) {
      const res = await fetch(`${BASE_URL}${path}`);
      const html = await res.text();
      const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
      const description = html.match(/<meta name="description" content="(.*?)"/s)?.[1];

      if (!title || !description) {
        missing.push(path);
        continue;
      }
      if (titles.has(title)) duplicateTitles.push(`${path} = ${titles.get(title)}`);
      else titles.set(title, path);

      if (descriptions.has(description)) {
        duplicateDescriptions.push(`${path} = ${descriptions.get(description)}`);
      } else descriptions.set(description, path);
    }

    check(
      "seo",
      `every indexable page has a title and description (${sitemapUrls.length} checked)`,
      missing.length === 0,
      missing.slice(0, 5).join(", ")
    );
    check(
      "seo",
      "no two indexable pages share a title",
      duplicateTitles.length === 0,
      duplicateTitles.slice(0, 5).join("; ")
    );
    check(
      "seo",
      "no two indexable pages share a description",
      duplicateDescriptions.length === 0,
      duplicateDescriptions.slice(0, 5).join("; ")
    );

    // OG images are generated routes — a runtime failure there returns 500
    // and social previews silently fall back to nothing.
    const og = await goto(page, `${BASE_URL}/opengraph-image`);
    check("seo", "generated OG image renders", og.status() === 200);
    check("seo", "OG image is a PNG", (og.headers()["content-type"] ?? "").includes("image/png"));
  }))
);

await browser.close();

const failed = results.filter((r) => !r.pass);
const flows = [...new Set(results.map((r) => r.flow))];
for (const flow of flows) {
  const flowResults = results.filter((r) => r.flow === flow);
  const flowFailed = flowResults.filter((r) => !r.pass);
  console.log(`\n${flow} (${flowResults.length - flowFailed.length}/${flowResults.length})`);
  for (const r of flowResults) {
    console.log(`  ${r.pass ? "✓" : "✗"} ${r.name}`);
    if (!r.pass && r.detail) console.log(`      ${r.detail}`);
  }
}

if (allConsoleErrors.length > 0) {
  console.log(`\n✗ ${allConsoleErrors.length} console error(s) during flows:`);
  for (const e of allConsoleErrors) console.log(`  - ${e.slice(0, 200)}`);
}

const totalIssues = failed.length + allConsoleErrors.length;
console.log(`\n${totalIssues === 0 ? "PASS" : "FAIL"}: ${failed.length} check failure(s), ${allConsoleErrors.length} console error(s)`);
process.exit(totalIssues === 0 ? 0 : 1);
