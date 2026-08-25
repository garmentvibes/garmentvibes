-- The order sizes are shown in.
--
-- `retail_product_sizes` has never had one. It did not need one: the
-- storefront renders from src/lib/mock/retail-products.ts, where the sizes are
-- an array and the array's order is the answer — S, M, L, XL for tops, 28
-- through 34 for waists, 2-3Y upward for kids.
--
-- Reading the catalogue from the database removes that. Rows come back in
-- whatever order Postgres finds them, which is neither insertion order nor
-- anything stable, so a product page would show "L XL S M" one day and "XL M L
-- S" the next. That is not a rendering detail: a size picker whose order moves
-- is one customers mis-tap.
--
-- ---------------------------------------------------------------------------
-- Why a column and not a rule
-- ---------------------------------------------------------------------------
--
-- Size order looks derivable — S before M before L — and stops being derivable
-- about one size in. This catalogue already carries three unrelated schemes in
-- one column: alphabetic (S/M/L/XL), waist inches (28/30/32/34), and age
-- ranges (2-3Y/4-5Y). "Free Size" belongs to none of them. A sort function
-- covering all three is a pile of special cases that a fourth scheme — EU shoe
-- sizes, bra sizes, a supplier who writes "Medium" — quietly breaks.
--
-- The order is a decision somebody made, not a fact derivable from the label,
-- so it is stored as one. The seed fills it from the array index the mock
-- catalogue already uses, which is that decision written down.
alter table retail_product_sizes add column if not exists sort_order integer not null default 0;

-- ---------------------------------------------------------------------------
-- Backfill, before the constraint rather than after it
-- ---------------------------------------------------------------------------
--
-- Every existing row arrives carrying the default of 0, so a product with four
-- sizes has four rows claiming position 0. The unique constraint below is
-- validated against existing rows when it is created — being DEFERRABLE
-- changes when checks happen inside a transaction, not whether the table has
-- to be valid to acquire the constraint at all — so this has to come first.
--
-- Scoped to products whose positions actually collide, which is what makes it
-- idempotent. The obvious guard, `where sort_order = 0`, is subtly wrong and
-- was: after a correct numbering every product still has exactly one row at 0,
-- so re-running would renumber that single row by label and land it on top of
-- a sibling. Applying 0019 twice failed on the duplicate key, which is how
-- this came to light.
--
-- Numbering by label is not the intended order — the real answer is the seed,
-- which writes the display order the mock catalogue has always used. This only
-- has to leave the table valid on the way there.
with colliding as (
  select product_id
    from retail_product_sizes
   group by product_id
  having count(*) > count(distinct sort_order)
),
numbered as (
  select s.id, row_number() over (partition by s.product_id order by s.label) - 1 as position
    from retail_product_sizes s
    join colliding c on c.product_id = s.product_id
)
update retail_product_sizes s
   set sort_order = numbered.position
  from numbered
 where numbered.id = s.id;

-- Distinct per product, so two sizes cannot claim the same slot and leave the
-- tie broken by whatever the planner feels like.
--
-- Deferrable because the seed upserts a product's whole size run in one
-- statement, and renumbering — inserting a size in the middle of an existing
-- run — passes through states where two rows briefly share a position.
alter table retail_product_sizes drop constraint if exists retail_product_sizes_order_unique;
alter table retail_product_sizes add constraint retail_product_sizes_order_unique
  unique (product_id, sort_order) deferrable initially deferred;
