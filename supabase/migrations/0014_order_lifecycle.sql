-- The two ends of an order's life that 0013 left open.
--
-- 0013 made `place_retail_order()` the only way an order gets written, and it
-- writes an online order as `pending` — taking stock, because the customer is
-- about to pay for it. That is the right shape: a payment can only be
-- reconciled against an order that already exists.
--
-- It leaves two things undone, and the checkout cannot be wired to it until
-- both are here:
--
--   1. Somebody has to mark the order paid. Nothing could, so every online
--      order would sit `pending` forever while the money arrived.
--   2. Somebody has to release the stock when the payment does not arrive.
--      A customer who opens the gateway and closes the tab has taken the last
--      unit of something out of the catalogue with nothing to show for it,
--      and it never comes back.
--
-- Both are functions rather than policies for the same reason as placement: a
-- customer with UPDATE on `retail_orders` can rewrite a total, and the stock
-- movement has to happen in the same transaction as the status change.

-- ---------------------------------------------------------------------------
-- 1. release_retail_order()
-- ---------------------------------------------------------------------------

-- Cancels the caller's own unpaid order and puts its stock back.
--
-- Deliberately narrow: `pending` only. A `confirmed` order has been paid for
-- and cancelling it is a refund, which is a different conversation and a
-- different function. A `shipped` one is in a van. Restricting to `pending`
-- means this can be called freely from the checkout's failure paths without
-- any risk of it unwinding something real.
--
-- Returns true when it cancelled something, false when there was nothing to
-- cancel — an order already cancelled, already paid, or belonging to someone
-- else. False rather than an exception because the callers are error paths:
-- a customer whose payment failed should not then see a second error about
-- the cleanup.
create or replace function public.release_retail_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_status order_status;
begin
  if v_user is null then
    return false;
  end if;

  -- Locked before the status is read, so two tabs cancelling the same order
  -- cannot both pass the check and both restore the stock.
  select user_id, status into v_owner, v_status
    from retail_orders
   where id = p_order_id
   for update;

  if not found or v_owner is distinct from v_user or v_status <> 'pending' then
    return false;
  end if;

  update retail_product_sizes s
     set stock_qty = s.stock_qty + i.qty
    from retail_order_items i
   where i.order_id = p_order_id
     and s.product_id = i.product_id
     and s.label = i.size;

  update retail_orders
     set status = 'cancelled', cancelled_at = current_date
   where id = p_order_id;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. mark_retail_order_paid()
-- ---------------------------------------------------------------------------

-- Moves a pending order to `confirmed` once the gateway says it was paid.
--
-- Addressed by `reference`, not by id, because that is what travels: the
-- receipt goes to Razorpay when the payment order is created and comes back
-- in the webhook payload. The id never leaves our side.
--
-- The amount is checked against the order's own total. A webhook is
-- authenticated by HMAC, so a forged one cannot reach here — but a *real*
-- notification for a different or partial payment can, and confirming an
-- order against the wrong amount is how something ships for less than it
-- cost.
--
-- Idempotent on purpose. Razorpay sends `payment.captured` and `order.paid`
-- for the same payment, retries anything it does not get a 2xx for, and the
-- browser's verify call may land first. Every one of those has to be safe:
-- an order already confirmed with this payment id returns its id and changes
-- nothing.
--
-- service_role only — see the revoke below.
create or replace function public.mark_retail_order_paid(
  p_reference text,
  p_payment_id text,
  p_amount integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status order_status;
  v_total integer;
  v_existing_payment text;
begin
  select id, status, total, razorpay_payment_id
    into v_id, v_status, v_total, v_existing_payment
    from retail_orders
   where reference = p_reference
   for update;

  if not found then
    raise exception 'mark_retail_order_paid: no order with reference %', p_reference
      using errcode = '23503';
  end if;

  -- Already done. Return quietly so a retried webhook is a no-op rather than
  -- an error Razorpay will keep retrying.
  if v_status <> 'pending' and v_existing_payment is not distinct from p_payment_id then
    return v_id;
  end if;

  if v_status <> 'pending' then
    raise exception 'mark_retail_order_paid: order % is %, not pending', p_reference, v_status
      using errcode = '22023';
  end if;

  if p_amount is distinct from v_total then
    raise exception 'mark_retail_order_paid: % paid % but the order is for %',
      p_reference, p_amount, v_total using errcode = '22023';
  end if;

  update retail_orders
     set status = 'confirmed', razorpay_payment_id = p_payment_id
   where id = v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Customers cancel their own unpaid orders; the function checks ownership.
revoke all on function public.release_retail_order(uuid) from public, anon;
grant execute on function public.release_retail_order(uuid) to authenticated, service_role;

-- Marking an order paid is not something a customer may do at any price. This
-- is called from the webhook and from the verify route, both of which run on
-- our server with the service role after checking Razorpay's HMAC.
revoke all on function public.mark_retail_order_paid(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.mark_retail_order_paid(text, text, integer) to service_role;

-- Looking an order up by its receipt is what both callers do first, and
-- `reference` already carries a unique index from 0004 — so this needs no new
-- index, only the note that the unique one is load-bearing for reads now and
-- not just for uniqueness.
