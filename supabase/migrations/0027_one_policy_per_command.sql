-- One permissive policy per table per command.
--
-- ---------------------------------------------------------------------------
-- What it costs today
-- ---------------------------------------------------------------------------
--
-- Supabase's performance advisor reports 175 multiple_permissive_policies
-- findings. The finding sounds like tidiness and is not: permissive policies
-- are OR'd, and Postgres does not short-circuit *across* them. Every policy on
-- a command is evaluated for every row considered, whichever one ends up
-- granting access.
--
-- Measured on the catalogue, with is_staff() instrumented to count its calls.
-- A fixture of 35 products, 34 of them active, read by a signed-out visitor:
--
--   before   34 rows returned, is_staff() called 35 times
--   after    34 rows returned, is_staff() called  1 time
--
-- Thirty-five lookups against `profiles` on behalf of somebody who has no
-- session and cannot be staff, on the most-requested query on the site.
--
-- The one remaining call is the interesting part, and is why the figure is 1
-- rather than 0: exactly one product is inactive, so for that row alone
-- `is_active = true` is false and the OR falls through to the staff branch.
-- The staff test is now paid only for rows the cheap test did not already
-- grant, which is the whole of the change.
--
-- The same shape repeats on every table where a customer policy and a staff
-- policy sit side by side.
--
-- ---------------------------------------------------------------------------
-- Why merging is safe
-- ---------------------------------------------------------------------------
--
-- This is not an approximation of the old behaviour. Postgres evaluates a set
-- of permissive policies by OR-ing them, and it OR's USING and WITH CHECK
-- independently of one another — a row may be reached under one policy's USING
-- and pass under another's WITH CHECK. So replacing a set with a single policy
-- whose USING is the OR of their USINGs, and whose WITH CHECK is the OR of
-- their WITH CHECKs, computes exactly the same predicate.
--
-- The per-command split matters for the same reason. A `for all` staff policy
-- also covers SELECT, so leaving it in place would keep a second policy on
-- every read even after the read policy absorbed the staff branch. Merging the
-- staff branch into the read policy and narrowing the rest to insert, update
-- and delete is what actually removes the per-row call.
--
-- Where a policy's WITH CHECK was absent, the OR uses its USING, because that
-- is what Postgres substitutes.
--
-- ---------------------------------------------------------------------------
-- Ordering
-- ---------------------------------------------------------------------------
--
-- The staff term is written last in every OR. Nearly every request is a
-- visitor's or a customer's, so the cheap owner test decides it and the staff
-- branch is skipped. Postgres does not promise left-to-right evaluation of OR,
-- so this is a cost hint rather than a guarantee — which is why the 33-to-0
-- figure above is measured rather than asserted.
--
-- ---------------------------------------------------------------------------
-- How this was checked
-- ---------------------------------------------------------------------------
--
-- Not by comparing policy text: the whole point is that the text differs. The
-- schema was built with and without this file and, for every table and every
-- kind of caller — signed out, two unrelated customers, staff, an approved
-- buyer, a buyer awaiting approval, a rival business — the exact set of
-- visible row ids was compared, along with how many rows each caller could
-- update and delete. Every one matched.
--
-- Generated mechanically from pg_policy, like 0024 and 0026, and for the same
-- reason: these predicates decide who reads whose orders.


drop policy if exists "Members can view their account's invoices" on credit_invoices;
drop policy if exists "Staff manage credit invoices" on credit_invoices;
drop policy if exists "Members can view payments on their invoices" on credit_payments;
drop policy if exists "Staff manage credit payments" on credit_payments;
drop policy if exists "Staff can update any profile" on profiles;
drop policy if exists "Staff can view all profiles" on profiles;
drop policy if exists "Users can insert their own profile" on profiles;
drop policy if exists "Users can update their own profile" on profiles;
drop policy if exists "Users can view their own profile" on profiles;
drop policy if exists "Live promo codes are readable" on promo_codes;
drop policy if exists "Staff can create promo codes" on promo_codes;
drop policy if exists "Staff can delete only non-built-in codes" on promo_codes;
drop policy if exists "Staff can edit promo codes" on promo_codes;
drop policy if exists "Staff can read every promo code" on promo_codes;
drop policy if exists "Staff can see every redemption" on promo_redemptions;
drop policy if exists "Users can see their own redemptions" on promo_redemptions;
drop policy if exists "Staff can view retail addresses" on retail_addresses;
drop policy if exists "Users manage their own addresses" on retail_addresses;
drop policy if exists "Staff manage retail order items" on retail_order_items;
drop policy if exists "Users can view their own retail order items" on retail_order_items;
drop policy if exists "Staff manage retail orders" on retail_orders;
drop policy if exists "Users can view their own retail orders" on retail_orders;
drop policy if exists "Retail sizes are publicly readable" on retail_product_sizes;
drop policy if exists "Staff manage retail sizes" on retail_product_sizes;
drop policy if exists "Retail catalog is publicly readable" on retail_products;
drop policy if exists "Staff manage retail products" on retail_products;
drop policy if exists "Staff manage return items" on return_items;
drop policy if exists "Users can add items to their own returns" on return_items;
drop policy if exists "Users can view their own return items" on return_items;
drop policy if exists "Staff manage returns" on return_requests;
drop policy if exists "Users can raise returns on their own orders" on return_requests;
drop policy if exists "Users can view returns on their own orders" on return_requests;
drop policy if exists "Published reviews are publicly readable" on reviews;
drop policy if exists "Staff moderate reviews" on reviews;
drop policy if exists "Users can edit their own reviews" on reviews;
drop policy if exists "Users can view their own reviews" on reviews;
drop policy if exists "Users can write their own reviews" on reviews;
drop policy if exists "Anyone can register a stock alert" on stock_alerts;
drop policy if exists "Staff manage stock alerts" on stock_alerts;
drop policy if exists "Users can cancel their own stock alerts" on stock_alerts;
drop policy if exists "Users can view their own stock alerts" on stock_alerts;
drop policy if exists "Members can view their colleagues" on wholesale_account_members;
drop policy if exists "Staff manage account members" on wholesale_account_members;
drop policy if exists "Anyone can apply for a wholesale account" on wholesale_accounts;
drop policy if exists "Members can view their own account" on wholesale_accounts;
drop policy if exists "Staff manage wholesale accounts" on wholesale_accounts;
drop policy if exists "Members can add lines to their claims" on wholesale_claim_lines;
drop policy if exists "Members can view their claim lines" on wholesale_claim_lines;
drop policy if exists "Staff manage claim lines" on wholesale_claim_lines;
drop policy if exists "Approved buyers can raise claims" on wholesale_claims;
drop policy if exists "Members can view their account's claims" on wholesale_claims;
drop policy if exists "Staff manage claims" on wholesale_claims;
drop policy if exists "Approved buyers can read wholesale prices" on wholesale_price_tiers;
drop policy if exists "Staff manage wholesale price tiers" on wholesale_price_tiers;
drop policy if exists "Staff manage wholesale products" on wholesale_products;
drop policy if exists "Wholesale catalog is publicly readable" on wholesale_products;
drop policy if exists "Staff manage wholesale quote items" on wholesale_quote_items;
drop policy if exists "Users can add items to their own wholesale quotes" on wholesale_quote_items;
drop policy if exists "Users can view their own wholesale quote items" on wholesale_quote_items;
drop policy if exists "Members can view their account's quotes" on wholesale_quotes;
drop policy if exists "Staff manage wholesale quotes" on wholesale_quotes;
drop policy if exists "Users can create their own wholesale quotes" on wholesale_quotes;
drop policy if exists "Users can view their own wholesale quotes" on wholesale_quotes;
drop policy if exists "Members manage their account's ship-to addresses" on wholesale_ship_to_addresses;
drop policy if exists "Staff can view ship-to addresses" on wholesale_ship_to_addresses;

-- was 2 policies, OR'd on every row:
--   · Members can view their account's invoices
--   · Staff manage credit invoices
drop policy if exists "Who may read credit_invoices" on credit_invoices;
create policy "Who may read credit_invoices"
  on credit_invoices for select
  using (((account_id = app_private.wholesale_account_id()))
       or (app_private.is_staff()));

-- from: Staff manage credit invoices
drop policy if exists "Who may insert into credit_invoices" on credit_invoices;
create policy "Who may insert into credit_invoices"
  on credit_invoices for insert
  with check (app_private.is_staff());

-- from: Staff manage credit invoices
drop policy if exists "Who may update credit_invoices" on credit_invoices;
create policy "Who may update credit_invoices"
  on credit_invoices for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage credit invoices
drop policy if exists "Who may delete from credit_invoices" on credit_invoices;
create policy "Who may delete from credit_invoices"
  on credit_invoices for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Members can view payments on their invoices
--   · Staff manage credit payments
drop policy if exists "Who may read credit_payments" on credit_payments;
create policy "Who may read credit_payments"
  on credit_payments for select
  using (((EXISTS ( SELECT 1
   FROM credit_invoices i
  WHERE ((i.id = credit_payments.invoice_id) AND (i.account_id = app_private.wholesale_account_id())))))
       or (app_private.is_staff()));

-- from: Staff manage credit payments
drop policy if exists "Who may insert into credit_payments" on credit_payments;
create policy "Who may insert into credit_payments"
  on credit_payments for insert
  with check (app_private.is_staff());

-- from: Staff manage credit payments
drop policy if exists "Who may update credit_payments" on credit_payments;
create policy "Who may update credit_payments"
  on credit_payments for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage credit payments
drop policy if exists "Who may delete from credit_payments" on credit_payments;
create policy "Who may delete from credit_payments"
  on credit_payments for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff can view all profiles
--   · Users can view their own profile
drop policy if exists "Who may read profiles" on profiles;
create policy "Who may read profiles"
  on profiles for select
  using (((( SELECT auth.uid() AS uid) = id))
       or (app_private.is_staff()));

-- from: Users can insert their own profile
drop policy if exists "Who may insert into profiles" on profiles;
create policy "Who may insert into profiles"
  on profiles for insert
  with check ((( SELECT auth.uid() AS uid) = id));

-- was 2 policies, OR'd on every row:
--   · Staff can update any profile
--   · Users can update their own profile
drop policy if exists "Who may update profiles" on profiles;
create policy "Who may update profiles"
  on profiles for update
  using (((( SELECT auth.uid() AS uid) = id))
       or (app_private.is_staff()))
  with check (((( SELECT auth.uid() AS uid) = id))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Live promo codes are readable
--   · Staff can read every promo code
drop policy if exists "Who may read promo_codes" on promo_codes;
create policy "Who may read promo_codes"
  on promo_codes for select
  using (((active AND ((starts_on IS NULL) OR (starts_on <= CURRENT_DATE)) AND ((expires_on IS NULL) OR (expires_on >= CURRENT_DATE))))
       or (app_private.is_staff()));

-- from: Staff can create promo codes
drop policy if exists "Who may insert into promo_codes" on promo_codes;
create policy "Who may insert into promo_codes"
  on promo_codes for insert
  with check (app_private.is_staff());

-- from: Staff can edit promo codes
drop policy if exists "Who may update promo_codes" on promo_codes;
create policy "Who may update promo_codes"
  on promo_codes for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff can delete only non-built-in codes
drop policy if exists "Who may delete from promo_codes" on promo_codes;
create policy "Who may delete from promo_codes"
  on promo_codes for delete
  using ((app_private.is_staff() AND (NOT built_in)));

-- was 2 policies, OR'd on every row:
--   · Staff can see every redemption
--   · Users can see their own redemptions
drop policy if exists "Who may read promo_redemptions" on promo_redemptions;
create policy "Who may read promo_redemptions"
  on promo_redemptions for select
  using (((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- from: Staff can see every redemption
drop policy if exists "Who may insert into promo_redemptions" on promo_redemptions;
create policy "Who may insert into promo_redemptions"
  on promo_redemptions for insert
  with check (app_private.is_staff());

-- from: Staff can see every redemption
drop policy if exists "Who may update promo_redemptions" on promo_redemptions;
create policy "Who may update promo_redemptions"
  on promo_redemptions for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff can see every redemption
drop policy if exists "Who may delete from promo_redemptions" on promo_redemptions;
create policy "Who may delete from promo_redemptions"
  on promo_redemptions for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff can view retail addresses
--   · Users manage their own addresses
drop policy if exists "Who may read retail_addresses" on retail_addresses;
create policy "Who may read retail_addresses"
  on retail_addresses for select
  using (((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- from: Users manage their own addresses
drop policy if exists "Who may insert into retail_addresses" on retail_addresses;
create policy "Who may insert into retail_addresses"
  on retail_addresses for insert
  with check ((( SELECT auth.uid() AS uid) = user_id));

-- from: Users manage their own addresses
drop policy if exists "Who may update retail_addresses" on retail_addresses;
create policy "Who may update retail_addresses"
  on retail_addresses for update
  using ((( SELECT auth.uid() AS uid) = user_id))
  with check ((( SELECT auth.uid() AS uid) = user_id));

-- from: Users manage their own addresses
drop policy if exists "Who may delete from retail_addresses" on retail_addresses;
create policy "Who may delete from retail_addresses"
  on retail_addresses for delete
  using ((( SELECT auth.uid() AS uid) = user_id));

-- was 2 policies, OR'd on every row:
--   · Staff manage retail order items
--   · Users can view their own retail order items
drop policy if exists "Who may read retail_order_items" on retail_order_items;
create policy "Who may read retail_order_items"
  on retail_order_items for select
  using (((EXISTS ( SELECT 1
   FROM retail_orders
  WHERE ((retail_orders.id = retail_order_items.order_id) AND (retail_orders.user_id = ( SELECT auth.uid() AS uid))))))
       or (app_private.is_staff()));

-- from: Staff manage retail order items
drop policy if exists "Who may insert into retail_order_items" on retail_order_items;
create policy "Who may insert into retail_order_items"
  on retail_order_items for insert
  with check (app_private.is_staff());

-- from: Staff manage retail order items
drop policy if exists "Who may update retail_order_items" on retail_order_items;
create policy "Who may update retail_order_items"
  on retail_order_items for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage retail order items
drop policy if exists "Who may delete from retail_order_items" on retail_order_items;
create policy "Who may delete from retail_order_items"
  on retail_order_items for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage retail orders
--   · Users can view their own retail orders
drop policy if exists "Who may read retail_orders" on retail_orders;
create policy "Who may read retail_orders"
  on retail_orders for select
  using (((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- from: Staff manage retail orders
drop policy if exists "Who may insert into retail_orders" on retail_orders;
create policy "Who may insert into retail_orders"
  on retail_orders for insert
  with check (app_private.is_staff());

-- from: Staff manage retail orders
drop policy if exists "Who may update retail_orders" on retail_orders;
create policy "Who may update retail_orders"
  on retail_orders for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage retail orders
drop policy if exists "Who may delete from retail_orders" on retail_orders;
create policy "Who may delete from retail_orders"
  on retail_orders for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Retail sizes are publicly readable
--   · Staff manage retail sizes
drop policy if exists "Who may read retail_product_sizes" on retail_product_sizes;
create policy "Who may read retail_product_sizes"
  on retail_product_sizes for select
  using (true);

-- from: Staff manage retail sizes
drop policy if exists "Who may insert into retail_product_sizes" on retail_product_sizes;
create policy "Who may insert into retail_product_sizes"
  on retail_product_sizes for insert
  with check (app_private.is_staff());

-- from: Staff manage retail sizes
drop policy if exists "Who may update retail_product_sizes" on retail_product_sizes;
create policy "Who may update retail_product_sizes"
  on retail_product_sizes for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage retail sizes
drop policy if exists "Who may delete from retail_product_sizes" on retail_product_sizes;
create policy "Who may delete from retail_product_sizes"
  on retail_product_sizes for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Retail catalog is publicly readable
--   · Staff manage retail products
drop policy if exists "Who may read retail_products" on retail_products;
create policy "Who may read retail_products"
  on retail_products for select
  using (((is_active = true))
       or (app_private.is_staff()));

-- from: Staff manage retail products
drop policy if exists "Who may insert into retail_products" on retail_products;
create policy "Who may insert into retail_products"
  on retail_products for insert
  with check (app_private.is_staff());

-- from: Staff manage retail products
drop policy if exists "Who may update retail_products" on retail_products;
create policy "Who may update retail_products"
  on retail_products for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage retail products
drop policy if exists "Who may delete from retail_products" on retail_products;
create policy "Who may delete from retail_products"
  on retail_products for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage return items
--   · Users can view their own return items
drop policy if exists "Who may read return_items" on return_items;
create policy "Who may read return_items"
  on return_items for select
  using (((EXISTS ( SELECT 1
   FROM (return_requests r
     JOIN retail_orders o ON ((o.id = r.order_id)))
  WHERE ((r.id = return_items.return_id) AND (o.user_id = ( SELECT auth.uid() AS uid))))))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Staff manage return items
--   · Users can add items to their own returns
drop policy if exists "Who may insert into return_items" on return_items;
create policy "Who may insert into return_items"
  on return_items for insert
  with check (((EXISTS ( SELECT 1
   FROM (return_requests r
     JOIN retail_orders o ON ((o.id = r.order_id)))
  WHERE ((r.id = return_items.return_id) AND (o.user_id = ( SELECT auth.uid() AS uid))))))
       or (app_private.is_staff()));

-- from: Staff manage return items
drop policy if exists "Who may update return_items" on return_items;
create policy "Who may update return_items"
  on return_items for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage return items
drop policy if exists "Who may delete from return_items" on return_items;
create policy "Who may delete from return_items"
  on return_items for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage returns
--   · Users can view returns on their own orders
drop policy if exists "Who may read return_requests" on return_requests;
create policy "Who may read return_requests"
  on return_requests for select
  using (((EXISTS ( SELECT 1
   FROM retail_orders
  WHERE ((retail_orders.id = return_requests.order_id) AND (retail_orders.user_id = ( SELECT auth.uid() AS uid))))))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Staff manage returns
--   · Users can raise returns on their own orders
drop policy if exists "Who may insert into return_requests" on return_requests;
create policy "Who may insert into return_requests"
  on return_requests for insert
  with check ((((status = 'requested'::return_status) AND (EXISTS ( SELECT 1
   FROM retail_orders
  WHERE ((retail_orders.id = return_requests.order_id) AND (retail_orders.user_id = ( SELECT auth.uid() AS uid)))))))
       or (app_private.is_staff()));

-- from: Staff manage returns
drop policy if exists "Who may update return_requests" on return_requests;
create policy "Who may update return_requests"
  on return_requests for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage returns
drop policy if exists "Who may delete from return_requests" on return_requests;
create policy "Who may delete from return_requests"
  on return_requests for delete
  using (app_private.is_staff());

-- was 3 policies, OR'd on every row:
--   · Published reviews are publicly readable
--   · Staff moderate reviews
--   · Users can view their own reviews
drop policy if exists "Who may read reviews" on reviews;
create policy "Who may read reviews"
  on reviews for select
  using (((status = 'published'::review_status))
       or ((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Staff moderate reviews
--   · Users can write their own reviews
drop policy if exists "Who may insert into reviews" on reviews;
create policy "Who may insert into reviews"
  on reviews for insert
  with check (((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Staff moderate reviews
--   · Users can edit their own reviews
drop policy if exists "Who may update reviews" on reviews;
create policy "Who may update reviews"
  on reviews for update
  using (((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()))
  with check ((((( SELECT auth.uid() AS uid) = user_id) AND (status = 'pending'::review_status)))
       or (app_private.is_staff()));

-- from: Staff moderate reviews
drop policy if exists "Who may delete from reviews" on reviews;
create policy "Who may delete from reviews"
  on reviews for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage stock alerts
--   · Users can view their own stock alerts
drop policy if exists "Who may read stock_alerts" on stock_alerts;
create policy "Who may read stock_alerts"
  on stock_alerts for select
  using ((((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Anyone can register a stock alert
--   · Staff manage stock alerts
drop policy if exists "Who may insert into stock_alerts" on stock_alerts;
create policy "Who may insert into stock_alerts"
  on stock_alerts for insert
  with check (true);

-- from: Staff manage stock alerts
drop policy if exists "Who may update stock_alerts" on stock_alerts;
create policy "Who may update stock_alerts"
  on stock_alerts for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage stock alerts
--   · Users can cancel their own stock alerts
drop policy if exists "Who may delete from stock_alerts" on stock_alerts;
create policy "Who may delete from stock_alerts"
  on stock_alerts for delete
  using ((((( SELECT auth.uid() AS uid) IS NOT NULL) AND (( SELECT auth.uid() AS uid) = user_id)))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Members can view their colleagues
--   · Staff manage account members
drop policy if exists "Who may read wholesale_account_members" on wholesale_account_members;
create policy "Who may read wholesale_account_members"
  on wholesale_account_members for select
  using (((account_id = app_private.wholesale_account_id()))
       or (app_private.is_staff()));

-- from: Staff manage account members
drop policy if exists "Who may insert into wholesale_account_members" on wholesale_account_members;
create policy "Who may insert into wholesale_account_members"
  on wholesale_account_members for insert
  with check (app_private.is_staff());

-- from: Staff manage account members
drop policy if exists "Who may update wholesale_account_members" on wholesale_account_members;
create policy "Who may update wholesale_account_members"
  on wholesale_account_members for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage account members
drop policy if exists "Who may delete from wholesale_account_members" on wholesale_account_members;
create policy "Who may delete from wholesale_account_members"
  on wholesale_account_members for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Members can view their own account
--   · Staff manage wholesale accounts
drop policy if exists "Who may read wholesale_accounts" on wholesale_accounts;
create policy "Who may read wholesale_accounts"
  on wholesale_accounts for select
  using (((id = app_private.wholesale_account_id()))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Anyone can apply for a wholesale account
--   · Staff manage wholesale accounts
drop policy if exists "Who may insert into wholesale_accounts" on wholesale_accounts;
create policy "Who may insert into wholesale_accounts"
  on wholesale_accounts for insert
  with check ((((status = 'pending'::wholesale_approval_status) AND (payment_terms = 'prepay'::payment_terms)))
       or (app_private.is_staff()));

-- from: Staff manage wholesale accounts
drop policy if exists "Who may update wholesale_accounts" on wholesale_accounts;
create policy "Who may update wholesale_accounts"
  on wholesale_accounts for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage wholesale accounts
drop policy if exists "Who may delete from wholesale_accounts" on wholesale_accounts;
create policy "Who may delete from wholesale_accounts"
  on wholesale_accounts for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Members can view their claim lines
--   · Staff manage claim lines
drop policy if exists "Who may read wholesale_claim_lines" on wholesale_claim_lines;
create policy "Who may read wholesale_claim_lines"
  on wholesale_claim_lines for select
  using (((EXISTS ( SELECT 1
   FROM wholesale_claims c
  WHERE ((c.id = wholesale_claim_lines.claim_id) AND (c.account_id = app_private.wholesale_account_id())))))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Members can add lines to their claims
--   · Staff manage claim lines
drop policy if exists "Who may insert into wholesale_claim_lines" on wholesale_claim_lines;
create policy "Who may insert into wholesale_claim_lines"
  on wholesale_claim_lines for insert
  with check (((EXISTS ( SELECT 1
   FROM wholesale_claims c
  WHERE ((c.id = wholesale_claim_lines.claim_id) AND (c.account_id = app_private.wholesale_account_id())))))
       or (app_private.is_staff()));

-- from: Staff manage claim lines
drop policy if exists "Who may update wholesale_claim_lines" on wholesale_claim_lines;
create policy "Who may update wholesale_claim_lines"
  on wholesale_claim_lines for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage claim lines
drop policy if exists "Who may delete from wholesale_claim_lines" on wholesale_claim_lines;
create policy "Who may delete from wholesale_claim_lines"
  on wholesale_claim_lines for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Members can view their account's claims
--   · Staff manage claims
drop policy if exists "Who may read wholesale_claims" on wholesale_claims;
create policy "Who may read wholesale_claims"
  on wholesale_claims for select
  using ((((account_id IS NOT NULL) AND (account_id = app_private.wholesale_account_id())))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Approved buyers can raise claims
--   · Staff manage claims
drop policy if exists "Who may insert into wholesale_claims" on wholesale_claims;
create policy "Who may insert into wholesale_claims"
  on wholesale_claims for insert
  with check ((((status = 'submitted'::claim_status) AND app_private.is_approved_wholesale() AND (account_id = app_private.wholesale_account_id())))
       or (app_private.is_staff()));

-- from: Staff manage claims
drop policy if exists "Who may update wholesale_claims" on wholesale_claims;
create policy "Who may update wholesale_claims"
  on wholesale_claims for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage claims
drop policy if exists "Who may delete from wholesale_claims" on wholesale_claims;
create policy "Who may delete from wholesale_claims"
  on wholesale_claims for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Approved buyers can read wholesale prices
--   · Staff manage wholesale price tiers
drop policy if exists "Who may read wholesale_price_tiers" on wholesale_price_tiers;
create policy "Who may read wholesale_price_tiers"
  on wholesale_price_tiers for select
  using ((app_private.is_approved_wholesale())
       or (app_private.is_staff()));

-- from: Staff manage wholesale price tiers
drop policy if exists "Who may insert into wholesale_price_tiers" on wholesale_price_tiers;
create policy "Who may insert into wholesale_price_tiers"
  on wholesale_price_tiers for insert
  with check (app_private.is_staff());

-- from: Staff manage wholesale price tiers
drop policy if exists "Who may update wholesale_price_tiers" on wholesale_price_tiers;
create policy "Who may update wholesale_price_tiers"
  on wholesale_price_tiers for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage wholesale price tiers
drop policy if exists "Who may delete from wholesale_price_tiers" on wholesale_price_tiers;
create policy "Who may delete from wholesale_price_tiers"
  on wholesale_price_tiers for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage wholesale products
--   · Wholesale catalog is publicly readable
drop policy if exists "Who may read wholesale_products" on wholesale_products;
create policy "Who may read wholesale_products"
  on wholesale_products for select
  using (((is_active = true))
       or (app_private.is_staff()));

-- from: Staff manage wholesale products
drop policy if exists "Who may insert into wholesale_products" on wholesale_products;
create policy "Who may insert into wholesale_products"
  on wholesale_products for insert
  with check (app_private.is_staff());

-- from: Staff manage wholesale products
drop policy if exists "Who may update wholesale_products" on wholesale_products;
create policy "Who may update wholesale_products"
  on wholesale_products for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage wholesale products
drop policy if exists "Who may delete from wholesale_products" on wholesale_products;
create policy "Who may delete from wholesale_products"
  on wholesale_products for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Staff manage wholesale quote items
--   · Users can view their own wholesale quote items
drop policy if exists "Who may read wholesale_quote_items" on wholesale_quote_items;
create policy "Who may read wholesale_quote_items"
  on wholesale_quote_items for select
  using (((EXISTS ( SELECT 1
   FROM wholesale_quotes
  WHERE ((wholesale_quotes.id = wholesale_quote_items.quote_id) AND (wholesale_quotes.user_id = ( SELECT auth.uid() AS uid))))))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Staff manage wholesale quote items
--   · Users can add items to their own wholesale quotes
drop policy if exists "Who may insert into wholesale_quote_items" on wholesale_quote_items;
create policy "Who may insert into wholesale_quote_items"
  on wholesale_quote_items for insert
  with check (((EXISTS ( SELECT 1
   FROM wholesale_quotes
  WHERE ((wholesale_quotes.id = wholesale_quote_items.quote_id) AND (wholesale_quotes.user_id = ( SELECT auth.uid() AS uid))))))
       or (app_private.is_staff()));

-- from: Staff manage wholesale quote items
drop policy if exists "Who may update wholesale_quote_items" on wholesale_quote_items;
create policy "Who may update wholesale_quote_items"
  on wholesale_quote_items for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage wholesale quote items
drop policy if exists "Who may delete from wholesale_quote_items" on wholesale_quote_items;
create policy "Who may delete from wholesale_quote_items"
  on wholesale_quote_items for delete
  using (app_private.is_staff());

-- was 3 policies, OR'd on every row:
--   · Members can view their account's quotes
--   · Staff manage wholesale quotes
--   · Users can view their own wholesale quotes
drop policy if exists "Who may read wholesale_quotes" on wholesale_quotes;
create policy "Who may read wholesale_quotes"
  on wholesale_quotes for select
  using ((((account_id IS NOT NULL) AND (account_id = app_private.wholesale_account_id())))
       or ((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- was 2 policies, OR'd on every row:
--   · Staff manage wholesale quotes
--   · Users can create their own wholesale quotes
drop policy if exists "Who may insert into wholesale_quotes" on wholesale_quotes;
create policy "Who may insert into wholesale_quotes"
  on wholesale_quotes for insert
  with check (((( SELECT auth.uid() AS uid) = user_id))
       or (app_private.is_staff()));

-- from: Staff manage wholesale quotes
drop policy if exists "Who may update wholesale_quotes" on wholesale_quotes;
create policy "Who may update wholesale_quotes"
  on wholesale_quotes for update
  using (app_private.is_staff())
  with check (app_private.is_staff());

-- from: Staff manage wholesale quotes
drop policy if exists "Who may delete from wholesale_quotes" on wholesale_quotes;
create policy "Who may delete from wholesale_quotes"
  on wholesale_quotes for delete
  using (app_private.is_staff());

-- was 2 policies, OR'd on every row:
--   · Members manage their account's ship-to addresses
--   · Staff can view ship-to addresses
drop policy if exists "Who may read wholesale_ship_to_addresses" on wholesale_ship_to_addresses;
create policy "Who may read wholesale_ship_to_addresses"
  on wholesale_ship_to_addresses for select
  using (((account_id = app_private.wholesale_account_id()))
       or (app_private.is_staff()));

-- from: Members manage their account's ship-to addresses
drop policy if exists "Who may insert into wholesale_ship_to_addresses" on wholesale_ship_to_addresses;
create policy "Who may insert into wholesale_ship_to_addresses"
  on wholesale_ship_to_addresses for insert
  with check ((account_id = app_private.wholesale_account_id()));

-- from: Members manage their account's ship-to addresses
drop policy if exists "Who may update wholesale_ship_to_addresses" on wholesale_ship_to_addresses;
create policy "Who may update wholesale_ship_to_addresses"
  on wholesale_ship_to_addresses for update
  using ((account_id = app_private.wholesale_account_id()))
  with check ((account_id = app_private.wholesale_account_id()));

-- from: Members manage their account's ship-to addresses
drop policy if exists "Who may delete from wholesale_ship_to_addresses" on wholesale_ship_to_addresses;
create policy "Who may delete from wholesale_ship_to_addresses"
  on wholesale_ship_to_addresses for delete
  using ((account_id = app_private.wholesale_account_id()));
