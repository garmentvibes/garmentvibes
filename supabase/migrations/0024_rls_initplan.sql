-- Evaluating auth.uid() once per query instead of once per row.
--
-- Supabase's performance advisor reports `auth_rls_initplan` against 22
-- policies on 13 tables. The finding is not about correctness: `auth.uid()`
-- reads a GUC and returns the same answer for every row in a statement, but
-- Postgres cannot know that from the call alone, so it re-evaluates it for
-- each row it tests. Wrapping it in a scalar subquery — `(select auth.uid())`
-- — turns it into an InitPlan the planner runs once.
--
-- It matters most exactly where these policies matter most. "My orders" scans
-- a table holding every customer's orders and the policy is what narrows it;
-- the per-row call is paid on every row considered, not on every row returned.
--
-- ---------------------------------------------------------------------------
-- Why the policies are restated rather than the originals edited
-- ---------------------------------------------------------------------------
--
-- The migrations that created these have already been applied — to the live
-- project and to every contributor's scratch database — so editing them in
-- place would change nothing that exists and quietly diverge the file from the
-- schema it supposedly describes. Additive, like 0002, 0011 and 0012 before it.
--
-- ---------------------------------------------------------------------------
-- How these were produced
-- ---------------------------------------------------------------------------
--
-- Mechanically, from `pg_get_expr(polqual, polrelid)` on the built schema,
-- with `auth.uid()` replaced by `(select auth.uid())` and nothing else
-- touched. Retyping twenty-two policies that decide who can read whose orders
-- is not a place for hand-copying: a predicate transcribed slightly wrong is a
-- customer reading somebody else's order history, and it would look exactly
-- like a policy that was always there.
--
-- Two things check the result, because the tests alone were not enough.
--
-- Structurally: the schema was built twice, with and without this file, and
-- every policy in `public` dumped through pg_get_expr — name, command, roles,
-- USING and WITH CHECK. Normalising the subselect away makes the two sets
-- identical, 68 policies either side, which is the strongest available
-- statement that nothing but the wrapping changed.
--
-- Behaviourally: supabase/tests/10_rls_isolation.sql and 11_policy_isolation.sql
-- create real users and check what each one can see and write. 11 exists
-- because of this migration — opening each of these twenty-two policies in
-- turn (`using (true)`) showed that thirteen of them could have been deleted
-- outright with every test still passing.


drop policy if exists "Users manage their own cart" on cart_items;
create policy "Users manage their own cart"
  on cart_items for all
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can insert their own profile" on profiles;
create policy "Users can insert their own profile"
  on profiles for insert
  with check (((select auth.uid()) = id));

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using (((select auth.uid()) = id));

drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
  on profiles for select
  using (((select auth.uid()) = id));

drop policy if exists "Users can see their own redemptions" on promo_redemptions;
create policy "Users can see their own redemptions"
  on promo_redemptions for select
  using (((select auth.uid()) = user_id));

drop policy if exists "Users manage their own addresses" on retail_addresses;
create policy "Users manage their own addresses"
  on retail_addresses for all
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can view their own retail order items" on retail_order_items;
create policy "Users can view their own retail order items"
  on retail_order_items for select
  using ((EXISTS ( SELECT 1
   FROM retail_orders
  WHERE ((retail_orders.id = retail_order_items.order_id) AND (retail_orders.user_id = (select auth.uid()))))));

drop policy if exists "Users can view their own retail orders" on retail_orders;
create policy "Users can view their own retail orders"
  on retail_orders for select
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can add items to their own returns" on return_items;
create policy "Users can add items to their own returns"
  on return_items for insert
  with check ((EXISTS ( SELECT 1
   FROM (return_requests r
     JOIN retail_orders o ON ((o.id = r.order_id)))
  WHERE ((r.id = return_items.return_id) AND (o.user_id = (select auth.uid()))))));

drop policy if exists "Users can view their own return items" on return_items;
create policy "Users can view their own return items"
  on return_items for select
  using ((EXISTS ( SELECT 1
   FROM (return_requests r
     JOIN retail_orders o ON ((o.id = r.order_id)))
  WHERE ((r.id = return_items.return_id) AND (o.user_id = (select auth.uid()))))));

drop policy if exists "Users can raise returns on their own orders" on return_requests;
create policy "Users can raise returns on their own orders"
  on return_requests for insert
  with check (((status = 'requested'::return_status) AND (EXISTS ( SELECT 1
   FROM retail_orders
  WHERE ((retail_orders.id = return_requests.order_id) AND (retail_orders.user_id = (select auth.uid())))))));

drop policy if exists "Users can view returns on their own orders" on return_requests;
create policy "Users can view returns on their own orders"
  on return_requests for select
  using ((EXISTS ( SELECT 1
   FROM retail_orders
  WHERE ((retail_orders.id = return_requests.order_id) AND (retail_orders.user_id = (select auth.uid()))))));

drop policy if exists "Users can edit their own reviews" on reviews;
create policy "Users can edit their own reviews"
  on reviews for update
  using (((select auth.uid()) = user_id))
  with check ((((select auth.uid()) = user_id) AND (status = 'pending'::review_status)));

drop policy if exists "Users can view their own reviews" on reviews;
create policy "Users can view their own reviews"
  on reviews for select
  using (((select auth.uid()) = user_id));

drop policy if exists "Users can write their own reviews" on reviews;
create policy "Users can write their own reviews"
  on reviews for insert
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can cancel their own stock alerts" on stock_alerts;
create policy "Users can cancel their own stock alerts"
  on stock_alerts for delete
  using ((((select auth.uid()) IS NOT NULL) AND ((select auth.uid()) = user_id)));

drop policy if exists "Users can view their own stock alerts" on stock_alerts;
create policy "Users can view their own stock alerts"
  on stock_alerts for select
  using ((((select auth.uid()) IS NOT NULL) AND ((select auth.uid()) = user_id)));

drop policy if exists "Users can add items to their own wholesale quotes" on wholesale_quote_items;
create policy "Users can add items to their own wholesale quotes"
  on wholesale_quote_items for insert
  with check ((EXISTS ( SELECT 1
   FROM wholesale_quotes
  WHERE ((wholesale_quotes.id = wholesale_quote_items.quote_id) AND (wholesale_quotes.user_id = (select auth.uid()))))));

drop policy if exists "Users can view their own wholesale quote items" on wholesale_quote_items;
create policy "Users can view their own wholesale quote items"
  on wholesale_quote_items for select
  using ((EXISTS ( SELECT 1
   FROM wholesale_quotes
  WHERE ((wholesale_quotes.id = wholesale_quote_items.quote_id) AND (wholesale_quotes.user_id = (select auth.uid()))))));

drop policy if exists "Users can create their own wholesale quotes" on wholesale_quotes;
create policy "Users can create their own wholesale quotes"
  on wholesale_quotes for insert
  with check (((select auth.uid()) = user_id));

drop policy if exists "Users can view their own wholesale quotes" on wholesale_quotes;
create policy "Users can view their own wholesale quotes"
  on wholesale_quotes for select
  using (((select auth.uid()) = user_id));

drop policy if exists "Users manage their own wishlist" on wishlists;
create policy "Users manage their own wishlist"
  on wishlists for all
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));
