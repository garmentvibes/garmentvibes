-- How many times each promo code has been redeemed.
--
-- The admin panel prints "12 of 100 used" beside every code, and until now it
-- got that from the same localStorage store it got the codes from. 0017 moved
-- the count into `promo_redemptions`, so the panel needs a way to read it.
--
-- ---------------------------------------------------------------------------
-- Why a view rather than counting in the app
-- ---------------------------------------------------------------------------
--
-- PostgREST cannot GROUP BY, so the alternative is fetching every redemption
-- row and counting them in JavaScript. That works on the day the ledger holds
-- forty rows and is an increasingly silly amount of data to move as it holds
-- forty thousand — to render a number.
--
-- The other alternative is PostgREST's embedded aggregate,
-- `select=*,promo_redemptions(count)`. That would need no migration, and it is
-- rejected because it cannot be tested here: supabase/tests runs SQL against a
-- plain Postgres with no PostgREST in front of it, so the shape it returns
-- would be something this repo asserts nothing about and finds out about in
-- production. A view is ordinary SQL and the tests can hold it to account.
--
-- ---------------------------------------------------------------------------
-- security_invoker
-- ---------------------------------------------------------------------------
--
-- Same reasoning as `credit_invoice_balances` in 0008. A view runs as its
-- owner by default, which would make this one a hole straight through the RLS
-- on `promo_redemptions`: any signed-in customer could read how many times
-- every campaign had been redeemed. With security_invoker the view evaluates
-- as the caller, so the policies on the underlying table still apply — staff
-- see every code's usage, and a customer sees only rows they own, which for
-- this view means only their own redemptions counted.
create or replace view public.promo_code_usage
with (security_invoker = true) as
select
  c.code,
  -- A left join, so a code nobody has redeemed appears with zero rather than
  -- vanishing. The panel has to be able to show "0 of 100 used"; a missing row
  -- would render as a blank where a number belongs.
  count(r.id)::integer as redemptions,
  -- Distinct customers, which is not the same number and is the one worth
  -- looking at for a campaign: 40 redemptions across 40 people is a campaign
  -- working, and across 2 people is something else.
  count(distinct r.user_id)::integer as customers
from promo_codes c
left join promo_redemptions r on r.code = c.code
group by c.code;

comment on view public.promo_code_usage is
  'Redemption counts per promo code. security_invoker, so RLS on promo_redemptions still applies: staff see every code, a customer sees only their own.';

grant select on public.promo_code_usage to authenticated, service_role;
