-- Back-in-stock alerts, server-side.
--
-- `stock_alerts` has existed since 0005 and nothing has ever written to it.
-- The registrations the storefront actually collects live in a zustand store,
-- and `src/lib/notify-restock.ts` fires them from the browser — so an alert
-- reaches its customer only if the admin who restocks the size happens to be
-- sitting at the same device that took the registration. On any other device,
-- and on every server, the alert does not exist.
--
-- 0028 put the wishlist here for the same reason. This is the other half: the
-- one the 0005 comment was actually about.
--
-- ---------------------------------------------------------------------------
-- Firing by query, not by trigger and not by call site
-- ---------------------------------------------------------------------------
--
-- The obvious design is to notify from wherever stock goes up. There are two
-- such places today — `adjust_retail_stock` from 0023, and the plain UPDATE
-- behind `setRetailStock` — and the number is not stable: `place_retail_order`
-- moves stock the other way, a cancellation moves it back, and whatever is
-- added next will move it too. Wiring the notification to the call sites means
-- the set of restocks that notify is the set somebody remembered.
--
-- A trigger on `retail_product_sizes` would catch all of them, but a trigger
-- cannot compose the message: the templates are TypeScript, and a trigger that
-- tried to write a notification row would be a second, worse copy of them.
--
-- So neither. `claim_stock_alerts` asks the question directly — which pending
-- alerts name a variant that has stock right now — and that question has the
-- same answer however the stock got there. It is a query, so it needs no
-- event; it can be run after a stock write for promptness and again on a
-- schedule for completeness, and running it twice costs nothing because the
-- first run stamps what it took.
--
-- ---------------------------------------------------------------------------
-- The claim is modelled on 0020's, deliberately
-- ---------------------------------------------------------------------------
--
-- Same hazards, so the same shape: `for update skip locked` so two passes take
-- disjoint work rather than both emailing the same person, and the stamp
-- written at claim time rather than after the send, so a pass that dies
-- mid-flight does not leave the row to be claimed again by the next one.
--
-- The trade is the same one 0020 made and for the same reason: a message may
-- be lost if a pass dies between claiming and queueing, and that is better
-- than one sent twice. A customer emailed twice about the same restock is a
-- customer who unsubscribes.
--
-- ---------------------------------------------------------------------------
-- What this closes
-- ---------------------------------------------------------------------------
--
-- `anon` currently holds INSERT on `stock_alerts`, under a policy whose check
-- is literally `true`. That was the intent — 0005 says anyone may register
-- interest, including a signed-out visitor, and that is still the product
-- decision — but the implementation lets a caller choose every column,
-- including `user_id`. So a signed-out request can register somebody else's
-- email address, and can attach the row to somebody else's account, where it
-- will show up in their alert list as something they never asked for.
--
-- The grants go and the function becomes the only door. It still takes an
-- email from anyone, signed in or not, because that is the feature; what it no
-- longer takes is a `user_id`, which it reads from the session instead.

-- ---------------------------------------------------------------------------
-- Registering
-- ---------------------------------------------------------------------------

/**
 * Registers interest in a sold-out variant.
 *
 * Returns true when a row was written, false when this address was already
 * waiting on this variant — which the caller shows as "you're already on the
 * list" rather than as a failure.
 *
 * Callable signed out, which is the whole point of the feature: somebody who
 * finds a sold-out size should not have to make an account to hear about it.
 * `user_id` therefore comes from the session and is null when there is none;
 * it is not a parameter, because a caller who could set it could file their
 * registration under somebody else's name.
 *
 * `active_product_id` rather than a bare lookup, so a withdrawn product cannot
 * take registrations. There is no restock coming for something we have stopped
 * selling, and the alert would sit pending for ever.
 */
create or replace function public.stock_alert_subscribe(
  p_slug text,
  p_size text,
  p_email text,
  p_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_written integer;
begin
  -- Shape only. Deliverability is the transport's problem and cannot be
  -- decided here; what this refuses is the empty string and the obvious
  -- nonsense, so a typo does not become a row that can never be sent.
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'A valid email address is required' using errcode = '22023';
  end if;

  v_product := active_product_id(p_slug);
  if v_product is null then
    raise exception 'No such product: %', p_slug using errcode = '22023';
  end if;

  -- The size has to be one the product is sold in. `stock_alerts` stores the
  -- label as text with no foreign key, so nothing else would catch "XXL" on a
  -- product that stops at L — and that registration would wait for a restock
  -- of a size that does not exist.
  if not exists (
    select 1 from retail_product_sizes
     where product_id = v_product and label = p_size
  ) then
    raise exception 'Size % is not available for %', p_size, p_slug using errcode = '22023';
  end if;

  insert into stock_alerts (product_id, size_label, email, name, user_id)
  values (
    v_product,
    p_size,
    v_email,
    -- Falling back to the local part rather than refusing: a name is for
    -- addressing the email, and "Hi," with nothing after it is a worse
    -- outcome than a name the customer did not choose.
    case when v_name = '' then split_part(v_email, '@', 1) else v_name end,
    auth.uid()
  )
  -- Infers `stock_alerts_unique_pending` from 0005, which is partial on
  -- `notified_at is null`. That partiality is what lets somebody register
  -- again after being told once: the row that fired no longer sits under the
  -- index, so a later restock of the same variant can be asked about afresh.
  on conflict (product_id, size_label, (lower(email))) where notified_at is null
  do nothing;

  get diagnostics v_written = row_count;
  return v_written > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Claiming what is due
-- ---------------------------------------------------------------------------

/**
 * Takes up to `p_limit` alerts whose variant is back in stock, and stamps them.
 *
 * Returns the rows, for the caller to compose messages from. It does not write
 * to `notifications` itself: the message bodies are TypeScript templates, and
 * a second copy of them in SQL is how the email a customer gets stops matching
 * the one staff can read in the outbox.
 *
 * `is_active` as well as `stock_qty`, because a product can be withdrawn while
 * registrations are pending against it. Telling somebody an item is available
 * again and landing them on a page that no longer exists is worse than saying
 * nothing; those rows simply stay pending, and can be seen.
 *
 * The stamp is what makes this safe to run often. Claimed rows leave the
 * pending set, so the pass that runs a second later finds nothing, and the
 * registration cannot fire twice for one restock.
 */
create or replace function public.claim_stock_alerts(p_limit integer default 100)
returns setof stock_alerts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with due as (
    select a.id
      from stock_alerts a
      join retail_products p on p.id = a.product_id
      join retail_product_sizes s
        on s.product_id = a.product_id and s.label = a.size_label
     where a.notified_at is null
       and s.stock_qty > 0
       and p.is_active = true
     -- Oldest first: somebody who has been waiting a month hears before
     -- somebody who registered this morning, which is the order they would
     -- expect if they could see the queue.
     order by a.created_at
     limit p_limit
     -- `of a` so the lock is taken on the registration and not on the product
     -- or its size row — those are read here and written by every sale, and
     -- locking them would make a dispatch pass block checkout.
     for update of a skip locked
  )
  update stock_alerts a
     set notified_at = now()
    from due
   where a.id = due.id
  returning a.*;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- The function is the only way a registration appears, so that the caller
-- cannot choose `user_id`, cannot register against a withdrawn product, and
-- cannot register a size that does not exist.
--
-- UPDATE goes too. The only column worth updating is `notified_at`, and that
-- is precisely what the claim owns: a hand-written update that set it would
-- silently drop somebody's alert, and one that cleared it would send a second.
-- Staff have no reason to reach either, and 0009's outbox is where they look.
--
-- SELECT and DELETE stay as 0005 left them: a customer may see and cancel
-- their own registrations.
revoke insert, update on stock_alerts from anon, authenticated;

-- Signed out as well as signed in, because that is the feature.
--
-- The grant is written out even though it is not, on this project, what admits
-- anon: Supabase's `alter default privileges` already grants EXECUTE on new
-- functions in `public` to anon, authenticated and service_role, so a function
-- created here arrives callable and `revoke ... from public` does not take that
-- away — only naming the role does. A mutation removing this line therefore
-- changes nothing, which is exactly why it is worth saying so here rather than
-- leaving the next reader to assume the line is load-bearing.
--
-- It stays because it states the intent where the intent is checkable, and
-- because a project whose default privileges were tightened later would need
-- it. The `revoke ... from public` is the part with teeth: it drops the grant
-- Postgres itself gives to PUBLIC on creation, which no Supabase default
-- covers.
revoke all on function public.stock_alert_subscribe(text, text, text, text) from public;
grant execute on function public.stock_alert_subscribe(text, text, text, text)
  to anon, authenticated;

-- Service role only, for the reason 0020 gives about `claim_notifications`:
-- claiming takes a registration off the queue, and a mistake there is a
-- customer who is never told. There is no user behind a dispatch pass, so
-- there is no session whose permissions would mean anything — not even a
-- staff one.
revoke all on function public.claim_stock_alerts(integer) from public, anon, authenticated;
grant execute on function public.claim_stock_alerts(integer) to service_role;
