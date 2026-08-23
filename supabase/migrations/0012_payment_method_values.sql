-- Payment methods the checkout actually offers.
--
-- `payment_method` was created in 0004 as ('online', 'cod'), which was true
-- then. The checkout now offers six — UPI, card, net banking, wallet, EMI and
-- COD — and recording all of them as "online" throws away the one detail
-- reconciliation needs: settlement timing and chargeback behaviour differ per
-- method, so "which orders were paid by card" is a question the finance side
-- will ask and an `online` bucket cannot answer.
--
-- `online` is kept rather than renamed. Rows already carrying it are truthful
-- as far as they go, and rewriting history to claim a precision the record
-- never had would be worse than a value that means "online, method not
-- captured".
--
-- Alone in its own file, like 0002, because Postgres will not let a new enum
-- value be *used* in the transaction that adds it — and 0013 uses these.

alter type payment_method add value if not exists 'upi' after 'online';
alter type payment_method add value if not exists 'card' after 'upi';
alter type payment_method add value if not exists 'netbanking' after 'card';
alter type payment_method add value if not exists 'wallet' after 'netbanking';
alter type payment_method add value if not exists 'emi' after 'wallet';
