-- ---------------------------------------------------------------------------
-- Moving stock that is not a sale.
--
-- `place_retail_order` takes stock and `release_retail_order` gives it back;
-- both are covered in 40 and 44. This is the other pair of movements: a return
-- coming back onto the shelf and an exchange replacement leaving it, both
-- driven from the admin panel.
--
-- What is worth testing here is not "does the number change". It is that the
-- number cannot be moved by someone who should not be moving it, cannot go
-- below zero, and cannot be lost when two adjustments land together — the last
-- of which is the reason this is a function rather than an update.
-- ---------------------------------------------------------------------------

begin;

-- A product to move stock on, and two accounts to try it as.
insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('cccccccc-0000-0000-0000-00000000000a', 'test-restock-tee', 'Restock Tee',
        'GarmentVibes', 'men', 'T-Shirts', 49900, 99900)
on conflict (slug) do nothing;

insert into retail_product_sizes (product_id, label, stock_qty, sort_order) values
  ('cccccccc-0000-0000-0000-00000000000a', 'M', 4, 0),
  ('cccccccc-0000-0000-0000-00000000000a', 'L', 0, 1)
on conflict (product_id, label) do update set stock_qty = excluded.stock_qty;

insert into auth.users (id, email) values
  ('cccccccc-1111-1111-1111-111111111111', 'stock-staff@garmentvibes.com'),
  ('cccccccc-2222-2222-2222-222222222222', 'stock-shopper@example.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('cccccccc-1111-1111-1111-111111111111', 'admin', 'Stock Staff', 'stock-staff@garmentvibes.com'),
  ('cccccccc-2222-2222-2222-222222222222', 'retail', 'Shopper', 'stock-shopper@example.com')
on conflict (id) do update set role = excluded.role;

-- ---------------------------------------------------------------------------
-- Who may move stock
-- ---------------------------------------------------------------------------

-- The important one. A customer who could take stock off could make the last
-- unit of anything unbuyable for everybody else; one who could put stock on
-- could order goods that do not exist.
select assert(
  as_user_error('cccccccc-2222-2222-2222-222222222222',
    $$select adjust_retail_stock('test-restock-tee', 'M', 5)$$)
    like '%Only staff can adjust stock%',
  'stock: a signed-in customer cannot adjust stock');

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-00000000000a' and label = 'M') = 4,
  'stock: and their attempt moved nothing');

-- Matched on the message rather than asked "was this refused?", because a
-- signed-out caller is refused twice over and the two are not interchangeable.
-- `is_staff()` would turn them away even with the grant in place, so
-- anon_denied() passes whether or not the grant exists — it cannot see which
-- door is shut. This names the outer one: the function is not published to
-- `anon` at all, so the request dies before any of its logic runs.
select assert(
  anon_error($$select adjust_retail_stock('test-restock-tee', 'M', 5)$$)
    like '%permission denied for function adjust_retail_stock%',
  'stock: the function is not published to a signed-out visitor');

-- ---------------------------------------------------------------------------
-- The movements themselves
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'M', 3)$$) = '7',
  'stock: staff can put a returned unit back, and are told the new level');

select assert(
  as_user_scalar('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'M', -2)$$) = '5',
  'stock: and can take an exchange replacement off');

-- ---------------------------------------------------------------------------
-- What it refuses
-- ---------------------------------------------------------------------------

-- The `stock_qty >= 0` constraint from 0005 would catch this too. The point of
-- catching it here is that the admin gets a sentence rather than a constraint
-- name, and that the row is left alone rather than the transaction aborting.
select assert(
  as_user_error('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'M', -99)$$)
    like '%Not enough stock%',
  'stock: cannot remove more than is on the shelf');

select assert(
  (select stock_qty from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-00000000000a' and label = 'M') = 5,
  'stock: and the refused adjustment left the level alone');

-- A size that does not exist and a size that is merely empty are different
-- problems with different fixes, so they do not share a message.
select assert(
  as_user_error('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'XXL', 5)$$)
    like '%is not sold in size%',
  'stock: a size the product does not have is named as such');

select assert(
  as_user_error('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('no-such-product', 'M', 5)$$)
    like '%No such product%',
  'stock: an unknown product is named as such');

select assert(
  as_user_error('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'M', 0)$$)
    like '%must move something%',
  'stock: an adjustment of nothing is a mistake, not a no-op');

-- ---------------------------------------------------------------------------
-- Zero is reachable and leaving zero works
-- ---------------------------------------------------------------------------

-- Taking the last unit has to be allowed — that is a sale — and the generated
-- `in_stock` column has to follow it, because that is what the storefront's
-- sold-out state and the back-in-stock alerts key on.
select assert(
  as_user_scalar('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'M', -5)$$) = '0',
  'stock: the last unit can be taken');

select assert(
  (select in_stock from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-00000000000a' and label = 'M') = false,
  'stock: and in_stock follows it down, since 0005 generates it from the level');

select assert(
  as_user_scalar('cccccccc-1111-1111-1111-111111111111',
    $$select adjust_retail_stock('test-restock-tee', 'L', 6)$$) = '6',
  'stock: a size that was empty can be restocked');

select assert(
  (select in_stock from retail_product_sizes
    where product_id = 'cccccccc-0000-0000-0000-00000000000a' and label = 'L') = true,
  'stock: and in_stock follows it back up');

-- ---------------------------------------------------------------------------
-- Why this is a function and not an update
-- ---------------------------------------------------------------------------

-- The adjustment is relative — `stock_qty = stock_qty + delta` in one
-- statement — so two returns approved in the same moment cannot both read the
-- same starting level and write the same result, losing a unit. A single
-- session cannot stage that race, so this asserts the property that makes the
-- race impossible: the new level is computed from the column, never from a
-- value the caller supplied.
--
-- The weaker kind of check, and labelled as such: it reads the function body
-- rather than observing two concurrent callers.
select assert(
  (select prosrc from pg_proc where proname = 'adjust_retail_stock')
    like '%stock_qty = stock_qty + p_delta%',
  'stock: the level is computed from the column, not from a number read earlier');

rollback;
