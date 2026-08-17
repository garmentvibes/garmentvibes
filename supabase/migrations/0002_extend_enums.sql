-- Enum values the app grew past 0001.
--
-- Alone in its own migration on purpose: Postgres allows `alter type ... add
-- value` inside a transaction, but the new value cannot be *used* until that
-- transaction commits. Since each migration file is applied as one
-- transaction, anything referencing these values has to live in a later file
-- — hence 0003 onwards.

-- The admin panel is a third role, not a flavour of retail: staff read every
-- customer's orders, which is exactly what the policies must key on.
alter type user_role add value if not exists 'admin';

-- src/types/admin.ts carries a "packed" step between confirmed and shipped —
-- the picking stage, which is where an order actually sits for most of its
-- life in a small operation.
alter type order_status add value if not exists 'packed' after 'confirmed';

-- Wholesale runs a longer pipeline than retail: a quote is priced before it
-- is confirmed, and goods are made before they ship.
alter type quote_status add value if not exists 'quoted' after 'requested';
alter type quote_status add value if not exists 'in_production' after 'confirmed';
alter type quote_status add value if not exists 'shipped' after 'in_production';
