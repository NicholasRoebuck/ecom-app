-- Match variant_id's BIGINT signedness to product_variant.id when applying manually.
CREATE TABLE IF NOT EXISTS product_variant_option (
    variant_id BIGINT NOT NULL,
    option_name VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    option_value VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    PRIMARY KEY (variant_id, option_name),
    CONSTRAINT fk_variant_option_variant FOREIGN KEY (variant_id) REFERENCES product_variant(id) ON DELETE CASCADE
);
-- Keep the selected option labels in the immutable order item name.
ALTER TABLE order_item MODIFY COLUMN product_name TEXT NULL;
