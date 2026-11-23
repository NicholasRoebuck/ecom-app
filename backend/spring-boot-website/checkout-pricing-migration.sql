-- Apply once to the existing MySQL database before starting the updated backend.
-- Additive only: existing orders and order items remain intact.
ALTER TABLE orders
    ADD COLUMN checkout_token VARCHAR(36) NULL,
    ADD COLUMN payment_intent_id VARCHAR(255) NULL,
    ADD COLUMN currency VARCHAR(3) NULL,
    ADD UNIQUE KEY uk_orders_checkout_token (checkout_token),
    ADD UNIQUE KEY uk_orders_payment_intent (payment_intent_id);
ALTER TABLE order_item
    ADD COLUMN variant_id BIGINT NULL,
    ADD COLUMN sku VARCHAR(255) NULL,
    ADD COLUMN product_name VARCHAR(255) NULL;
