-- ---------------------------------------------------------------------------
-- Wholesale fulfilment: who can see a quote, and who can move it.
--
-- The wholesale half of 49. Until now the trade panel rendered
-- SEED_WHOLESALE_QUOTES with status changes kept in localStorage, so none of
-- these policies were load-bearing — nothing staff pressed reached a row.
--
-- The stakes here differ from retail in one way worth stating. A wholesale
-- buyer is another business, and `wholesale_quotes` carries what they are
-- paying per unit. One buyer reading another's order book is not an
-- embarrassment, it is commercially damaging: it hands them a competitor's
-- negotiated pricing.
-- ---------------------------------------------------------------------------

begin;

insert into auth.users (id, email) values
  ('eeeeeeee-1111-1111-1111-111111111111', 'trade-staff@garmentvibes.com'),
  ('eeeeeeee-2222-2222-2222-222222222222', 'meera@sunrise.example'),
  ('eeeeeeee-3333-3333-3333-333333333333', 'rival@othertraders.example')
on conflict (id) do nothing;

insert into profiles (id, role, full_name, email) values
  ('eeeeeeee-1111-1111-1111-111111111111', 'admin', 'Trade Staff', 'trade-staff@garmentvibes.com'),
  ('eeeeeeee-2222-2222-2222-222222222222', 'wholesale', 'Meera Iyer', 'meera@sunrise.example'),
  ('eeeeeeee-3333-3333-3333-333333333333', 'wholesale', 'Rival Buyer', 'rival@othertraders.example')
on conflict (id) do update set role = excluded.role;

insert into wholesale_quotes (
  id, user_id, status, total_estimate, reference, business_name, contact_name, email
) values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-2222-2222-2222-222222222222',
   'requested', 5256000, 'GV-Q-5001', 'Sunrise Traders', 'Meera Iyer', 'meera@sunrise.example'),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'eeeeeeee-3333-3333-3333-333333333333',
   'requested', 1200000, 'GV-Q-5002', 'Other Traders', 'Rival Buyer', 'rival@othertraders.example')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seeing
-- ---------------------------------------------------------------------------

select assert(
  visible_count('eeeeeeee-1111-1111-1111-111111111111',
    $$select count(*) from wholesale_quotes where reference in ('GV-Q-5001','GV-Q-5002')$$) = 2,
  'admin-quotes: staff see every quote');

-- The commercially important one: per-unit pricing is negotiated per buyer.
select assert(
  visible_count('eeeeeeee-3333-3333-3333-333333333333',
    $$select count(*) from wholesale_quotes where reference = 'GV-Q-5001'$$) = 0,
  'admin-quotes: one business cannot read another''s quote');

select assert(
  visible_count('eeeeeeee-2222-2222-2222-222222222222',
    $$select count(*) from wholesale_quotes where reference = 'GV-Q-5001'$$) = 1,
  'admin-quotes: but can read their own');

-- ---------------------------------------------------------------------------
-- Moving
-- ---------------------------------------------------------------------------

select assert(
  as_user_scalar('eeeeeeee-1111-1111-1111-111111111111', $$
    with moved as (
      update wholesale_quotes set status = 'quoted'
       where reference = 'GV-Q-5001' returning 1
    ) select count(*) from moved
  $$) = '1',
  'admin-quotes: staff can price a quote');

select assert(
  (select status from wholesale_quotes where reference = 'GV-Q-5001') = 'quoted',
  'admin-quotes: and the row carries it');

-- A buyer who could set their own status could mark a consignment `fulfilled`
-- — which, per 0007, starts the 7-day claim clock they would rather have run
-- later — or walk their own quote to `confirmed` without us pricing it.
select assert(
  as_user_scalar('eeeeeeee-2222-2222-2222-222222222222', $$
    with moved as (
      update wholesale_quotes set status = 'confirmed'
       where reference = 'GV-Q-5001' returning 1
    ) select count(*) from moved
  $$) = '0',
  'admin-quotes: a buyer cannot move their own quote');

select assert(
  (select status from wholesale_quotes where reference = 'GV-Q-5001') = 'quoted',
  'admin-quotes: and it stayed where staff left it');

-- ---------------------------------------------------------------------------
-- The statuses the panel offers
-- ---------------------------------------------------------------------------

-- Four came from 0001 and three more from 0002. The app's
-- WHOLESALE_QUOTE_STATUSES lists all seven, and setting one the enum lacks
-- would raise at a member of staff mid-fulfilment rather than saving.
select assert(
  (select count(*) from unnest(enum_range(null::quote_status)) as v
    where v::text in ('requested','quoted','confirmed','in_production',
                      'shipped','fulfilled','rejected')) = 7,
  'admin-quotes: every status the panel offers exists in the enum');

rollback;
