# Database schema

Migrations for the GarmentVibes Supabase project. They are applied to the live
project (below) and verified on every change against a throwaway Postgres:

```bash
npm run qa:schema
```

That rebuilds a scratch database, applies every migration in order, asserts the
structural invariants, and then becomes several different users to check that
the RLS policies actually isolate them. CI runs it against a `postgres:16`
service container on every push.

## The live project

Created 2026-08-22, `ap-south-1` (Mumbai — the right region for Indian
customers), Postgres 17.

| | |
| --- | --- |
| Project ref | `wonfvwcznydnmyjfkacn` |
| API URL | `https://wonfvwcznydnmyjfkacn.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/wonfvwcznydnmyjfkacn |

All eleven migrations and the catalogue seed are applied. Note the version
difference from local: the harness tests against Postgres 16 and the project
runs 17. Nothing here depends on a version-specific feature, and the applied
result was verified against the same invariants the local suite asserts.

Environment variables the app expects (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://wonfvwcznydnmyjfkacn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key from the dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service role key from the dashboard>
```

The service role key bypasses RLS entirely and must never gain a
`NEXT_PUBLIC_` prefix — that ships it to every browser along with the ability
to read and write every table.

## Applying to a project

To bring a project up from nothing — the live one, or a second one for staging:

```bash
supabase link --project-ref <ref>
supabase db push          # migrations
psql "$DATABASE_URL" -f supabase/seed.sql    # placeholder catalogue
```

There is one step the seed deliberately cannot do: **create the first staff
account**. Staff are identified by `profiles.role = 'admin'`, and a profile
needs a row in `auth.users`, which only Supabase Auth can create. So sign up
through the app as normal, then promote that account once:

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

Seeding an admin any other way would mean shipping a known account into every
environment, which is a back door rather than a convenience.

That row is what `/admin` checks. `src/lib/auth/dal.ts` verifies the session
with `auth.getUser()` and then reads `profiles.role`; being signed in as a
customer is not enough, and a customer who signs in at `/admin/login` is
signed straight back out. The `is_staff()` policies are the layer underneath —
even a mistake in the application gate leaves RLS refusing the rows.

The files are ordered and each is applied in its own transaction. Every
statement is guarded, so re-applying is a no-op rather than an error.

| File | What it adds |
| --- | --- |
| `0001_init.sql` | Profiles, both catalogues, retail orders, wholesale quotes |
| `0002_extend_enums.sql` | Enum values the app grew past — alone, see below |
| `0003_staff_and_shared.sql` | `is_staff()`, `touch_updated_at()`, staff policies |
| `0004_order_snapshots.sql` | Contact details, fulfilment, GST snapshot, invoice numbers |
| `0005_inventory_and_engagement.sql` | Per-variant stock, stock alerts, wishlists, carts, reviews |
| `0006_wholesale_accounts.sql` | Businesses, team members, addresses, trade-price gating |
| `0007_returns_and_claims.sql` | Returns, exchanges, wholesale claims |
| `0008_credit_ledger.sql` | Net-terms invoices, payments, balances view |
| `0009_promos_and_notifications.sql` | Promo codes, notification outbox |
| `0010_grants.sql` | Table privileges for `anon` / `authenticated` / `service_role` |
| `0011_advisor_fixes.sql` | Two findings from Supabase's database linter |
| `0012_payment_method_values.sql` | The six methods checkout offers — alone, see below |
| `0013_order_placement.sql` | `place_retail_order()`, and closing the direct INSERT |

`seed.sql` sits alongside them and is **generated**, not hand-written:

```bash
npm run seed:generate    # rewrite it from src/lib/mock/
npm run seed:check       # fail if it has fallen behind (runs in CI)
```

The TypeScript in `src/lib/mock/` stays the single source of truth. Maintaining
the catalogue twice would mean discovering the drift only when the storefront
and the database disagreed about a price, so `seed:check` regenerates and
compares on every CI run.

It loads 33 retail products with their sizes and stock levels, 25 wholesale
products with their quantity breaks, and the two built-in promo codes. Stock
quantities come from the same `getStock()` helper the storefront uses, so a
fresh database starts out showing exactly what the app shows today.

Every statement upserts on a natural key — slug, or product plus label — so
re-running updates rather than duplicating, and it is safe against a database
that already has data. `qa:schema` proves that by loading it twice and checking
the row count does not move.

The `images` column holds paths to the placeholder SVGs under
`public/placeholders/`, which are themselves generated — see
`npm run placeholders:generate`. Real photography goes in Supabase Storage and
a bucket URL goes in the same column; no schema change needed.

`0002` and `0012` contain nothing but `alter type ... add value` because
Postgres will not let a new enum value be *used* in the transaction that adds
it. Anything referencing those values has to live in a later file.

## Placing an order

`place_retail_order()` is the only supported way a retail order is written.
`0013` revokes the INSERT grant on `retail_orders` and `retail_order_items`
from `authenticated` and drops the two customer INSERT policies, so the
function is the only door rather than the preferred one.

The reason is that an RLS policy on an INSERT can check ownership and very
little else — certainly not the catalogue. The policy `0001` shipped accepted
any total a signed-in customer cared to name, which is the same ₹1-saree hole
`/api/razorpay/order` takes care to avoid, reopened at a different door. The
function re-derives item prices, the promo discount, the tax split and the
total, and refuses the call if the submitted figures disagree. It also takes
stock and writes the order in one transaction, which a client issuing three
separate PostgREST requests cannot do.

Lines are addressed by **slug**, not id. `src/lib/mock/` numbers products
`r1`, `r10`; the database generates uuids and the seed joins them by slug, so
the slug is the only identifier both sides share. The resolved uuid is what
gets stored on the line, because a slug is editable and an order must not
follow a rename.

`src/lib/orders/payload.ts` builds the arguments and is pure and unit-tested;
`src/lib/orders/actions.ts` is the server action around it.
`supabase/tests/40_order_placement.sql` runs 53 assertions against the whole
thing, including that a refused order leaves no stock taken and no header
behind.

Two things it deliberately does not do. It does not decide which GST slab a
product falls in — that is `src/lib/gst.ts`, tested there, and a second
implementation in PL/pgSQL would be a second thing to keep correct. It checks
that the rate is one GST actually has, and recomputes the split that follows
from it. And it does not let staff insert orders either, because grants are
per-role: a phone order typed in by hand should be priced by the same code as
every other order, and that flow gets its own function with a staff check when
it is built.

## Where each store lands

The app currently keeps all of this in `localStorage` via zustand. This is the
mapping to replace it with, store by store:

| Store | Table(s) |
| --- | --- |
| `session-store` | `profiles` (+ Supabase Auth for the session itself) |
| `cart-store` | `cart_items` |
| `wishlist-store` | `wishlists` |
| `address-store` | `retail_addresses` |
| `reviews-store` | `reviews` |
| `stock-store` | `retail_product_sizes.stock_qty` |
| `stock-alerts-store` | `stock_alerts` |
| `returns-store` | `return_requests` + `return_items` |
| `claims-store` | `wholesale_claims` + `wholesale_claim_lines` |
| `credit-store` | `credit_invoices` + `credit_payments` |
| `promo-store` | `promo_codes` + `promo_redemptions` |
| `referral-store` | `referrals` (unique on `friend_email`) |
| `questions-store` | `product_questions` |
| `fit-feedback-store` | `product_fit_votes` (unique on product + user) |
| `notification-store` | `notifications` |
| `team-store` | `wholesale_account_members` |
| `ship-to-store` | `wholesale_ship_to_addresses` |
| `wholesale-order-store` | `wholesale_quotes` + `wholesale_quote_items` |
| `admin-orders-store` | `retail_orders` / `wholesale_quotes` (no more overrides) |
| `admin-accounts-store` | `wholesale_accounts` |
| `admin-catalog-store` | `retail_products` / `wholesale_products` |
| `recently-viewed-store` | **stays local** — see below |

`supabase/tests/30_store_queries.sql` runs the reads and writes each of these
will need, as the role that will run them, so the migration is a mechanical
rewrite rather than a discovery exercise. Two findings from it that change how
the data access layer must be written:

**A refused read is not an empty read.** `anon` has no SELECT privilege at all
on the user-scoped tables or on `wholesale_price_tiers` — the request is
rejected before any policy is consulted. Through PostgREST that surfaces as a
**403, not an empty array**. So embedding price tiers in the public wholesale
catalogue query fails the *whole* request for signed-out visitors and renders
nothing, rather than degrading to "price on request". Fetch tiers as a
separate authenticated query instead of embedding them.

**Read `in_stock`, do not derive it.** It is a generated column, and computing
availability in the app is how a size shows as buyable and the order then
fails.

`recently-viewed-store` is deliberately not in the database. It is a per-device
browsing convenience with no server-side consumer, and storing it would turn a
harmless UI nicety into a retained record of what every customer looked at.

## Decisions worth knowing before you wire this up

**An account is a business, not a person.** `session-store.ts` hangs approval
status, payment terms and credit on the *user*. The portal also lets a business
invite colleagues, so that model would give two people at the same firm separate
copies of their employer's credit terms, and approving one would not approve the
other. Those fields live on `wholesale_accounts`, with people attached via
`profiles.wholesale_account_id` and `wholesale_account_members`.

**Orders snapshot, they don't join.** Customer name, phone, product name, tax
rate, taxable value and the seller's GSTIN are all copied onto the order. A
profile can be renamed, a product reworded and a GST rate changed by
notification — none of which may alter an invoice already issued. The joins
would be tidier and wrong.

**Tax is stored, not recomputed.** Per-line, because apparel is 5% up to ₹2,500
a piece and 18% above, so one order routinely mixes both. Two constraints
enforce what GST requires: a supply carries either CGST+SGST or IGST but never
both, and CGST and SGST are halves of the same tax.

**CGST and SGST are equal to within one paise, not exactly equal.** `0004`
asserted exact equality, which is right in spirit and impossible in integer
paise whenever the tax is an odd number of them — `src/lib/gst.ts` splits an
odd total as floor/remainder so the pair still sums to the tax actually
charged. Nothing had ever hit it because nothing had ever written an order,
and it is not a rare edge: over a thousand consecutive price points, **504
produce an odd total tax**. A ₹1,999 kurta is one of them — CGST 47.59, SGST
47.60. Roughly every second order would have been rejected by its own schema
the first time the storefront tried to save one. `0013` widens the constraint
to one paise, which still catches the whole tax landing in CGST or the two
halves drifting apart, and filing is in rupees so the asymmetry never reaches
a return. The same defect was on `wholesale_quotes` and is fixed alongside it.

**Invoice status is derived by trigger.** `credit_invoices.status` is recomputed
from its payments on every insert, update and delete, so it cannot disagree with
the arithmetic underneath it no matter which code path writes. Overpayment is
recorded rather than rejected — duplicate transfers happen, and refusing one
leaves the ledger further from the truth. A written-off invoice stays written
off.

**Trade pricing is gated.** `0001` made `wholesale_price_tiers` world-readable,
which publishes our trade prices to competitors and to retail customers who
would reasonably ask why they pay more. It is now restricted to approved
wholesale accounts; the product records stay public so the catalogue can still
be browsed and indexed.

**`in_stock` is generated from `stock_qty`.** They can no longer disagree, which
removes the class of bug where a size shows as available and the order then
fails. A check constraint stops stock going negative — that is the oversell
guard, and it is the only thing that stops two simultaneous checkouts both
taking the last unit.

**Reviews start unpublished.** The current store publishes immediately. There is
a `status` column and a moderation policy; `order_id` is what `verified` should
mean.

**`authenticated` has wide table grants on purpose.** Staff and customers are
both `authenticated`, and Postgres grants are per-role, so no grant can separate
them — trying would lock staff out of the admin panel. Row visibility is RLS's
job entirely. `anon` is granted much less: the catalogue, published reviews, live
promo codes, and inserts on stock alerts and wholesale applications.

## Known gaps

- **Promo redemption *caps* are still enforced in the browser only.** The
  code's *percent* is now checked server-side — `place_retail_order()` looks
  the code up, refuses one that is inactive or out of its date window, and
  rejects a discount that is not what the code is worth. So a code invented in
  the browser no longer discounts anything, and one created in the admin panel
  finally works end to end. What is still missing is the part only the database
  can do about *how many times* a code is used: `promo_codes` needs
  `max_redemptions`, `max_per_customer` and `issued_to`, plus a
  `promo_redemptions` table with a unique constraint on `(code, user_id)` and a
  counter checked in the same transaction as the order. Until then a determined
  person with two accounts can exceed a cap. The same applies to referrals,
  where the constraint belongs on `referrals.friend_email`.
- **A customer cannot cancel their own order yet.** There is no customer UPDATE
  policy on `retail_orders` — deliberately, since one would also let them
  rewrite a total — so the cancellation flow in `/shop/orders/[id]` still only
  touches local state. It needs the same treatment as placement: a function
  that checks the order belongs to the caller, that it has not shipped, puts
  the stock back and sets the status, all in one transaction.
- **Invoice numbering** is enforced unique but not generated here. GST requires a
  consecutive series per financial year; that belongs in a server action, and a
  half-designed scheme in the schema would be worse than none.
- **Abandoned-cart reminders have no trigger.** The rules — when each of the
  three reminders is due, the cooldown between them, the 14-day expiry, and
  every condition that stops a customer being messaged — are written and
  tested in `src/lib/abandoned-cart.ts`. What is missing is something to run
  them: the cart is `localStorage`, so it does not exist when the tab is
  closed, which is exactly when a reminder would need to go out. Once
  `cart_items` is the source of truth, a job that walks rows whose
  `updated_at` is stale and calls `dueReminder()` is the whole of it. The
  recovery prompt shown to a returning customer already works, because there
  the customer is present.
- **The seed covers the catalogue only.** No orders, customers, returns or
  invoices — the admin panel's demo data in `src/lib/mock/admin-data.ts` stays
  where it is. Loading fabricated orders into a real database would put
  invented revenue in front of whoever opens the dashboard first, and there is
  no honest way to mark a row as "not a real sale" once it is in the orders
  table.
