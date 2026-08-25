-- ---------------------------------------------------------------------------
-- Managing the catalogue.
--
-- 0003 gave staff `for all` on retail_products and retail_product_sizes and
-- nothing has ever used it: the admin panel edited a zustand store. These pin
-- the policies the server actions in src/lib/admin/products/ now depend on, so
-- a later tightening fails here rather than in a shop that cannot change a
-- price.
--
-- The section at the bottom is the more interesting one. It establishes the
-- fact the panel's "withdraw" button rests on: a product that has been ordered
-- cannot be deleted, and one that has not takes a customer's reviews and
-- wishlist entries with it when it goes. Neither is something an admin should
-- discover by pressing a button labelled "delete".
-- ---------------------------------------------------------------------------

begin;

truncate retail_products, promo_codes cascade;

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'staff@garmentvibes.com')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'retail', 'Asha', 'asha@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'admin', 'Staff', 'staff@garmentvibes.com')
on conflict (id) do update set role = excluded.role;

insert into retail_products (id, slug, name, brand, category, subcategory, price, mrp)
values ('bbbbbbbb-0000-0000-0000-000000000001', 'admin-kurta', 'Admin Kurta', 'Brand',
        'women', 'Kurtas', 199900, 249900);

insert into retail_product_sizes (product_id, label, stock_qty, sort_order) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'S', 10, 0),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'M', 10, 1);

-- ---------------------------------------------------------------------------
-- Staff can manage the catalogue
-- ---------------------------------------------------------------------------

select assert(
  as_user_error('44444444-4444-4444-4444-444444444444',
    $$update retail_products set price = 149900 where slug = 'admin-kurta'$$) is null,
  'products: staff can change a price');

select assert(
  (select price from retail_products where slug = 'admin-kurta') = 149900,
  'products: and it is the price that changed');

select assert(
  as_user_error('44444444-4444-4444-4444-444444444444', $$
    insert into retail_products (slug, name, brand, category, subcategory, price, mrp)
    values ('admin-new-tee', 'Admin New Tee', 'Brand', 'men', 'T-Shirts', 49900, 69900)
  $$) is null,
  'products: staff can add a product');

select assert(
  as_user_error('44444444-4444-4444-4444-444444444444', $$
    insert into retail_product_sizes (product_id, label, stock_qty, sort_order)
    values ((select id from retail_products where slug = 'admin-new-tee'), 'L', 0, 0)
  $$) is null,
  'products: and give it a size run');

-- The size-run replacement in saveSizes() renumbers rows in one statement, so
-- it passes through states where two sizes share a position. 0019's constraint
-- is DEFERRABLE for exactly this; made NOT DEFERRABLE, an admin reordering a
-- size run gets a duplicate-key error instead of a saved product.
select assert(
  as_user_error('44444444-4444-4444-4444-444444444444', $$
    insert into retail_product_sizes (product_id, label, stock_qty, sort_order)
    values
      ((select id from retail_products where slug = 'admin-kurta'), 'S', 10, 1),
      ((select id from retail_products where slug = 'admin-kurta'), 'M', 10, 0)
    on conflict (product_id, label) do update set sort_order = excluded.sort_order
  $$) is null,
  'products: a size run can be reordered in one statement');

select assert(
  (select array_agg(label order by sort_order)
     from retail_product_sizes s
     join retail_products p on p.id = s.product_id
    where p.slug = 'admin-kurta') = array['M', 'S'],
  'products: and the new order stuck');

-- ---------------------------------------------------------------------------
-- Customers cannot
-- ---------------------------------------------------------------------------

select assert(
  is_denied('11111111-1111-1111-1111-111111111111', $$
    insert into retail_products (slug, name, brand, category, subcategory, price, mrp)
    values ('customer-made', 'Customer Made', 'Brand', 'men', 'T-Shirts', 100, 100)
  $$),
  'products: a customer cannot add a product to the catalogue');

-- An UPDATE blocked by policy affects nothing rather than raising, so it is
-- counted rather than probed for an error.
select as_user_scalar('11111111-1111-1111-1111-111111111111',
  $$update retail_products set price = 1 where slug = 'admin-kurta' returning slug$$);

select assert(
  (select price from retail_products where slug = 'admin-kurta') = 149900,
  'products: nor reprice one to a rupee');

select as_user_scalar('11111111-1111-1111-1111-111111111111',
  $$update retail_product_sizes set stock_qty = 9999 returning label$$);

select assert(
  (select max(stock_qty) from retail_product_sizes) = 10,
  'products: nor conjure stock out of nothing');

select assert(
  anon_denied($$
    insert into retail_products (slug, name, brand, category, subcategory, price, mrp)
    values ('anon-made', 'Anon Made', 'Brand', 'men', 'T-Shirts', 100, 100)
  $$),
  'products: and a signed-out visitor cannot either');

-- ---------------------------------------------------------------------------
-- Why the panel withdraws rather than deletes
-- ---------------------------------------------------------------------------

-- An order against the kurta. retail_order_items.product_id references
-- retail_products with no ON DELETE clause, so this is what makes the product
-- undeletable — and correctly so: deleting it would be deleting the record of
-- what somebody bought.
insert into retail_orders (
  id, user_id, status, subtotal, discount, cod_fee,
  tax_cgst, tax_sgst, tax_igst, total, currency,
  shipping_address, customer_name, customer_email, phone,
  payment_method, reference
) values (
  'bbbbbbbb-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
  'confirmed', 149900, 0, 0, 3569, 3570, 0, 149900, 'INR',
  '{"line1":"1 Test Lane","city":"Hyderabad","state":"Telangana","pincode":"500001"}'::jsonb,
  'Asha', 'asha@example.com', '9999999999', 'upi', 'GV-ADMIN-TEST'
);

insert into retail_order_items (
  order_id, product_id, size, color, qty, price,
  product_name, hsn_code, taxable_value, tax_rate, tax_amount
) values (
  'bbbbbbbb-0000-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000001',
  'M', 'Rose', 1, 149900, 'Admin Kurta', '6106', 142762, 5, 7138
);

select assert(
  violates_constraint($$delete from retail_products where slug = 'admin-kurta'$$),
  'products: a product that has been ordered cannot be deleted, even by the owner');

select assert(
  (select count(*) from retail_products where slug = 'admin-kurta') = 1,
  'products: so it is still there to withdraw instead');

-- Withdrawing is what the panel does, and what the storefront already
-- respects: 0001's select policy is `using (is_active = true)`.
select assert(
  as_user_error('44444444-4444-4444-4444-444444444444',
    $$update retail_products set is_active = false where slug = 'admin-kurta'$$) is null,
  'products: staff can withdraw it from sale');

select assert(
  visible_count('11111111-1111-1111-1111-111111111111',
    $$select count(*)::int from retail_products where slug = 'admin-kurta'$$) = 0,
  'products: a customer can no longer see it');

select assert(
  visible_count('44444444-4444-4444-4444-444444444444',
    $$select count(*)::int from retail_products where slug = 'admin-kurta'$$) = 1,
  'products: while staff still can, to put it back');

-- And the other half of the argument: where a delete WOULD succeed, it takes
-- customer-owned records with it. A product nobody ordered still carries
-- reviews, wishlist entries and questions, all of them ON DELETE CASCADE.
insert into wishlists (user_id, product_id)
values ('11111111-1111-1111-1111-111111111111',
        (select id from retail_products where slug = 'admin-new-tee'));

select assert(
  (select count(*) from wishlists) = 1,
  'products: an unordered product has a wishlist entry against it');

delete from retail_products where slug = 'admin-new-tee';

select assert(
  (select count(*) from wishlists) = 0,
  'products: deleting it took the customer''s wishlist entry with it');

rollback;
