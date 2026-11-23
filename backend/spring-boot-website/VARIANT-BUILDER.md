# Simplified product editor

Sign in as owner and open Admin.

## Workflow

1. In Edit product, enter the name, category, description, price, optional SKU, stock per variant, image URL, and availability.
2. Define product options once. Enter values separated by commas, such as Small, Medium, Large, Extra Large.
3. Choose Update variants to see the resulting rows, or Save product to create the first batch automatically.
4. Use Customize on a variant to change its options, SKU, price, stock, image URL, or availability. Use product details resets its shared fields to the product values.
5. Save product.

There is no preview, selection-checkbox, or bulk-edit panel. Variants initially inherit product details. Product field changes update inherited rows; customized rows retain their overrides. Previously different legacy rows are recognized as customized so existing overrides are preserved.

SKU entry is optional. Blank SKUs are generated automatically. A supplied SKU is used directly for a standard product, or as the base for automatically generated variation SKUs. Database uniqueness checks still apply.

New image entries accept http(s) URLs. Unchanged legacy asset images remain valid so editing an existing product does not erase its images.

## Large option lists

There is no fixed value-count, combination-count, or saved-variant-count limit in the editor/API. Option names remain limited to 20 per product and individual names/values retain their database character limits.

Combinations are calculated lazily using exact integer indices. Each Update/Add more action adds up to 50 variants, and the interface displays 50 cards per page. Generation periodically yields to the browser and can be stopped. This avoids expanding a large combination space into memory at once.

Generation progress is saved, so Add more variants can continue after reopening the product. Removing a row records an exclusion so it is not recreated automatically. Changing/removing option values retains matching IDs and customized details; removing affected saved rows requires confirmation.

## Persistence and migration

The existing owner-only product API is unchanged. Product configuration now also stores:
- customizedSkus: the rows that keep their own details.
- excludedCombinations: intentionally removed choices.
- generationCursor: resumable generation position.

The internal defaults JSON property is retained for compatibility; the interface presents those values as product details. Storefront responses and checkout still use explicit variant IDs and server prices.

Apply product-editor-migration.sql on other databases before running this version. It widens product.variant_configuration from TEXT to LONGTEXT. The local development migration has been applied without changing existing values.

From backend/spring-boot-website:

~~~powershell
java --class-path C:/Users/roebu/.m2/repository/com/mysql/mysql-connector-j/9.6.0/mysql-connector-j-9.6.0.jar ProductEditorSchema.java
java --class-path C:/Users/roebu/.m2/repository/com/mysql/mysql-connector-j/9.6.0/mysql-connector-j-9.6.0.jar ProductEditorSchema.java --apply
~~~

Earlier variant-options, catalog-management, and product-option-definition migrations remain prerequisites.

## Verification

Restart the backend and refresh the frontend. Create a disposable product with four comma-separated sizes and save. Change the product price and verify inherited rows update. Customize one row, change its price, then change the product price again: the custom row must retain its own price. Save and reopen to verify persistence.

Try more than 100 values; use Add more variants and variant pagination, save partway, and reopen to continue. Delete a variant and ensure it stays excluded on subsequent updates. Test optional SKUs, HTTP image URLs, invalid prices/stock, stale edits, and owner-only access.

Run the focused frontend command in OWNER-ACCESS.md and the backend Maven test suite.
