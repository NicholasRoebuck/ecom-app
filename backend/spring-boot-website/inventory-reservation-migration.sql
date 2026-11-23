-- Apply once before starting the updated backend. Pause checkout traffic during migration.
-- Resolve/cancel existing unpaid Stripe intents before rollout: old orders did not reserve stock.
-- Existing paid orders are not retroactively deducted; reconcile physical inventory separately.
ALTER TABLE orders ADD COLUMN inventory_status VARCHAR(16) NOT NULL DEFAULT 'NONE';
