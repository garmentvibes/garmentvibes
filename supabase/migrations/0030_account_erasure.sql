-- Deleting a retail account.
--
-- Required by two things at once, and they do not ask for quite the same
-- thing:
--
--   * Apple's App Store guideline 5.1.1(v): an app that lets you create an
--     account must let you delete it from inside the app. Not by email, not by
--     ringing somebody.
--   * India's DPDP Act 2023, s.12: a Data Principal may demand erasure of
--     their personal data — subject to s.8(7), which is the whole design here.
--
-- ---------------------------------------------------------------------------
-- Why this is not a DELETE
-- ---------------------------------------------------------------------------
--
-- s.8(7) lets a Data Fiduciary keep personal data where another law requires
-- it, and another law does:
--
--   * CGST Act 2017 s.36 with Rule 56 — every registered person keeps their
--     books and invoices for 72 months from the due date of the annual return
--     for that year.
--   * Income Tax Rule 6F — six years.
--   * CGST Rule 46 — a tax invoice must carry the recipient's name and
--     address. So the identity ON a retained invoice is retained with it; an
--     invoice with the customer scrubbed out is not a valid invoice.
--
-- GarmentVibes bills under Provident Global Services, GSTIN 36EBQPS5960G1ZX.
-- Deleting an order to satisfy an erasure request would put that registration
-- in breach, and s.8(7) exists precisely so it does not have to.
--
-- So: orders, their items, their returns and their invoices stay, with the
-- name, address and contact the invoice needs. Everything with no retention
-- basis goes — the address book, the bag, the wishlist, the alerts, the
-- reviews, the outbox copies, the profile, the login.
--
-- ---------------------------------------------------------------------------
-- The schema already refused the naive version
-- ---------------------------------------------------------------------------
--
-- `retail_orders.user_id` is NOT NULL and its foreign key names no ON DELETE
-- action, so it defaults to NO ACTION: deleting the `auth.users` row fails for
-- any customer who has ever ordered, which is most of them. That is a useful
-- accident — it made it impossible to lose order history by accident — and the
-- fix is not to weaken it into a cascade but to sever the link explicitly.
--
-- The column becomes nullable and the erasure sets it null. A severed order
-- keeps every snapshot the invoice needs and stops being attributable to an
-- account: `user_id = auth.uid()` is never true of null, so it leaves the
-- customer's order history and stays in the admin's.
alter table retail_orders alter column user_id drop not null;

comment on column retail_orders.user_id is
  'The account that placed the order, or null once that account has been '
  'erased. Null does not mean a guest checkout — 0011 requires an account at '
  'checkout — it means the order is retained under CGST Rule 56 while the '
  'person is gone.';

-- ---------------------------------------------------------------------------
-- Erasing
-- ---------------------------------------------------------------------------

/**
 * Erases the caller's account and returns a receipt of what happened.
 *
 * One transaction, and it ends with the `auth.users` row. That is deliberate,
 * and it is the one place this goes around Supabase's Admin API.
 *
 * ## Why the login is deleted here rather than by the caller
 *
 * The alternative is a server action that erases through this function and
 * then calls `auth.admin.deleteUser`. Two steps, two failure points, and the
 * failure mode is the bad one: an account whose data is gone but whose login
 * still works, so the customer signs back in to an empty shell and has no idea
 * whether their request went through. Erasure is exactly the operation where
 * "half done" must not be reachable.
 *
 * Every table in `auth` that references `auth.users` does so ON DELETE
 * CASCADE — identities, sessions, one-time tokens, MFA factors, webauthn
 * credentials, oauth consents — so the row going takes the whole login with
 * it and leaves nothing orphaned. Those cascades are declared in the schema
 * rather than assumed, which means `npm run qa:drift` is watching them.
 *
 * What this does depend on is `postgres` — the role these migrations run as,
 * and so the owner of this function — holding DELETE on `auth.users`. It does
 * today, and Supabase has been tightening that schema over time. If it were
 * ever revoked the failure is the safe one: the delete raises, the whole
 * transaction rolls back, and the customer is told the erasure did not happen
 * rather than being left half-erased. That is the other reason for doing this
 * in one statement block instead of two round trips.
 *
 * ## What it refuses, and why refusing is not a dodge
 *
 * Apple asks for a path that works from inside the app, not for one that
 * ignores a contract in flight. An order that has not arrived is a promise to
 * a person we would no longer be able to contact, and a business account is a
 * credit relationship that one member cannot dissolve by pressing a button.
 * Both refuse with a reason and a next step rather than failing silently.
 */
create or replace function public.erase_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := require_caller();
  v_email text;
  v_phone text;
  v_role text;
  v_account uuid;
  v_open text;
  v_severed integer;
  v_erased jsonb := '{}'::jsonb;
  v_count integer;
begin
  select p.email, p.phone, p.role::text, p.wholesale_account_id
    into v_email, v_phone, v_role, v_account
    from profiles p where p.id = v_uid;

  if v_email is null then
    raise exception 'No such account' using errcode = '42501';
  end if;

  -- Staff. Deleting the account you administer the shop with, from the
  -- storefront, by pressing a button meant for customers, is a mistake nobody
  -- would want honoured.
  if v_role = 'admin' then
    raise exception 'A staff account cannot be deleted from the storefront'
      using errcode = '42501';
  end if;

  -- Business accounts. A wholesale buyer sits inside an account with a credit
  -- ledger, Net-30 invoices and possibly other members; removing one person
  -- from it is an account change, not an erasure, and an unpaid invoice is a
  -- debt that does not disappear because somebody closed their login.
  if v_account is not null
     or exists (select 1 from wholesale_quotes q where q.user_id = v_uid)
     or exists (select 1 from wholesale_account_members m where m.user_id = v_uid)
  then
    raise exception
      'A business account cannot be closed here. Please contact us so we can settle the account first.'
      using errcode = '42501';
  end if;

  -- An order still in flight. `delivered` and `cancelled` are the terminal
  -- states; anything else is a parcel in the world with a person expecting it,
  -- and erasing the only way to reach them serves nobody.
  select o.reference into v_open
    from retail_orders o
   where o.user_id = v_uid
     and o.status not in ('delivered', 'cancelled')
   order by o.created_at
   limit 1;

  if v_open is not null then
    raise exception
      'Order % has not been delivered yet. Your account can be deleted once it arrives or is cancelled.', v_open
      using errcode = '55000';
  end if;

  -- A return still being decided, for the same reason: it may owe them money.
  --
  -- The terminal states are spelled out rather than negated loosely, because
  -- `return_status` has six labels and only three of them are endings —
  -- `rejected` (we said no), `refunded` (we paid) and `exchange_shipped` (we
  -- sent a replacement). `requested`, `approved` and `picked_up` are all
  -- stages of something still owed.
  if exists (
    select 1 from return_requests r
      join retail_orders o on o.id = r.order_id
     where o.user_id = v_uid
       and r.status not in ('rejected', 'refunded', 'exchange_shipped')
  ) then
    raise exception
      'A return on your account is still open. Your account can be deleted once it is settled.'
      using errcode = '55000';
  end if;

  -- ---------------------------------------------------------------------
  -- Sever what must be kept
  -- ---------------------------------------------------------------------

  update retail_orders set user_id = null where user_id = v_uid;
  get diagnostics v_severed = row_count;

  -- ---------------------------------------------------------------------
  -- Erase what must not be
  -- ---------------------------------------------------------------------
  --
  -- Written out rather than left to the cascades on `auth.users`, even though
  -- most of these would go with it. Two reasons: the receipt below has to be
  -- able to say what went, and `stock_alerts` would NOT go — its foreign key
  -- is ON DELETE SET NULL, so a cascade would leave the row holding their
  -- email address with the account link quietly removed, which is the exact
  -- shape of a privacy bug nobody notices.

  delete from stock_alerts
   where user_id = v_uid or lower(email) = lower(v_email);
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('stock_alerts', v_count);

  -- The outbox holds a copy of every message sent to them, addressed by email
  -- or phone. It is an operational record, not a book of account: what the tax
  -- law wants kept is the invoice, not the email that mentioned it.
  delete from notifications
   where lower(recipient) = lower(v_email)
      or (v_phone is not null and v_phone <> '' and recipient = v_phone);
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('notifications', v_count);

  delete from retail_addresses where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('addresses', v_count);

  delete from cart_items where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('cart_items', v_count);

  delete from wishlists where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('wishlist_items', v_count);

  -- Reviews go rather than being anonymised. A review is an opinion attached
  -- to a person — `author` carries their name — and keeping the text while
  -- deleting the name would still be their words, published, after they asked
  -- to be forgotten. Losing the rating is the smaller harm.
  delete from reviews where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('reviews', v_count);

  delete from promo_redemptions where user_id = v_uid;
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('promo_redemptions', v_count);

  delete from promo_codes where issued_to = v_uid;
  get diagnostics v_count = row_count;
  v_erased := v_erased || jsonb_build_object('referral_codes', v_count);

  delete from profiles where id = v_uid;

  -- The login. Last, so that everything above has already committed or none of
  -- it has — and `retail_orders` is severed by now, so the NO ACTION foreign
  -- key that used to refuse this no longer has anything to refuse.
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'erased', v_erased,
    'orders_retained', v_severed,
    -- Said plainly, because the customer is shown it. An erasure that quietly
    -- keeps something is worse than one that says what it keeps and why.
    'retained_because',
      'Orders and their invoices are kept as GST law requires (CGST Rule 56). '
      'They are no longer linked to any account.'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- `authenticated` only, and it erases the caller and nobody else: the id comes
-- from `require_caller()` and is not a parameter, so there is no argument with
-- which to name a victim. A signed-out caller has no account to erase.
revoke all on function public.erase_my_account() from public, anon;
grant execute on function public.erase_my_account() to authenticated;
