-- Advance payment / credit balance (Phase 81) — wires up the previously-
-- dead FeeRules.advance_payment_allowed toggle. An overpayment beyond an
-- invoice's outstanding balance is capped at collection time and banked
-- here instead of silently inflating Invoice.amount_paid past what's owed.
ALTER TABLE "Student" ADD COLUMN "credit_balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Marks a Payment row as auto-applied from Student.credit_balance rather
-- than a caller-supplied manual collection method (collectPaymentSchema's
-- gateway enum deliberately excludes this value — it is never client-set).
ALTER TYPE "PaymentGateway" ADD VALUE IF NOT EXISTS 'CREDIT_BALANCE';
