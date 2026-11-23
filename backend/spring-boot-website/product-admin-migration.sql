-- Apply once through your normal migration process.
-- Check duplicate SKUs first; the SKU column must use a case-insensitive collation.
-- Skip the CREATE INDEX statement if a single-column unique SKU index already exists.
CREATE UNIQUE INDEX uk_product_variant_sku ON product_variant (sku);

-- Order-item product/variant IDs are immutable historical snapshots, not live relationships.
-- Remove only single-column catalog FKs on the matching snapshot ID columns.
-- Existing IDs, names, SKUs, prices, images, quantities, and order relationships are retained.
SELECT GROUP_CONCAT(CONCAT('DROP FOREIGN KEY `', REPLACE(constraint_name, '`', '``'), '`') SEPARATOR ', ')
INTO @catalog_snapshot_fk_drops
FROM (
    SELECT constraint_name
    FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE() AND table_name = 'order_item' AND referenced_table_name IS NOT NULL
    GROUP BY constraint_name
    HAVING COUNT(*) = 1 AND MAX(
        (column_name = 'product_id' AND referenced_table_name = 'product' AND referenced_column_name = 'id')
        OR (column_name = 'variant_id' AND referenced_table_name = 'product_variant' AND referenced_column_name = 'id')
    ) = 1
) snapshot_constraints;
SET @catalog_snapshot_sql = IF(@catalog_snapshot_fk_drops IS NULL,
    'SELECT 1', CONCAT('ALTER TABLE order_item ', @catalog_snapshot_fk_drops));
PREPARE catalog_snapshot_migration FROM @catalog_snapshot_sql;
EXECUTE catalog_snapshot_migration;
DEALLOCATE PREPARE catalog_snapshot_migration;
