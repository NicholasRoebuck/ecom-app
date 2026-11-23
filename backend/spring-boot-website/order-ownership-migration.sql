-- Additive migration. Historical and guest orders deliberately remain unassigned.
-- Binary collation is necessary: issuer/subject identity matching must be case sensitive.
ALTER TABLE orders
    ADD COLUMN owner_issuer VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    ADD COLUMN owner_subject VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    ADD INDEX idx_orders_owner (owner_issuer, owner_subject);
