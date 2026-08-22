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

`0002` contains nothing but `alter type ... add value` because Postgres will not
let a new enum value be *used* in the transaction that adds it. Anything
referencing those values has to live in a later file.

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
| `promo-store` | `promo_codes` |
| `notification-store` | `notifications` |
| `team-store` | `wholesale_account_members` |
| `ship-to-store` | `wholesale_ship_to_addresses` |
| `wholesale-order-store` | `wholesale_quotes` + `wholesale_quote_items` |
| `admin-orders-store` | `retail_orders` / `wholesale_quotes` (no more overrides) |
| `admin-accounts-store` | `wholesale_accounts` |
| `admin-catalog-store` | `retail_products` / `wholesale_products` |
| `recently-viewed-store` | **stays local** — see below |

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
both, and CGST always equals SGST.

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

- **Promo codes have no redemption cap** or per-customer limit, because the app
  has no concept of one. A percentage code with no cap can be shared publicly
  and used without limit, so anything beyond a private code needs that first.
- **Invoice numbering** is enforced unique but not generated here. GST requires a
  consecutive series per financial year; that belongs in a server action, and a
  half-designed scheme in the schema would be worse than none.
- **The seed covers the catalogue only.** No orders, customers, returns or
  invoices — the admin panel's demo data in `src/lib/mock/admin-data.ts` stays
  where it is. Loading fabricated orders into a real database would put
  invented revenue in front of whoever opens the dashboard first, and there is
  no honest way to mark a row as "not a real sale" once it is in the orders
  table.
