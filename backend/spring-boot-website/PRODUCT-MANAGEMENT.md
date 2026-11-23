# Product and variant management

Sign in as the configured store owner and open **Admin**. The product catalog supports search and pagination, adding products, editing product details, and deleting products.

## Product option workflow

Enter shared product details, define comma-separated options once, and use Customize for individual overrides. See VARIANT-BUILDER.md for the workflow and the product-option-definitions and product-editor migrations.

## Editing products

- Choose an existing category and enter a name and optional description.
- Names and descriptions are limited to 255 characters to match the current database.
- Every product needs at least one variant, with a USD price, nonnegative whole-number stock, and availability setting. SKU entry is optional; missing SKUs are generated.
- New image entries use http(s) URLs; unchanged legacy images are retained. File uploading and media hosting are not included.
- Add arbitrary named options, such as Size or Lens type. Use the same names on every variant and a unique combination of values. Update variants adds missing rows in batches; existing matching variants retain their IDs and customized overrides.
- Leaving every option map empty preserves the existing SKU-based selector.
- Save product submits the product and all variants together. Removing a variant takes effect only when you save.
- Turning off Available for purchase keeps the variant in the catalog while preventing purchase through the existing availability checks. It does not delete it.
- Product deletion requires confirmation. Existing order items retain their purchased names, SKUs, images, quantities, and prices. Saved orders/checkouts keep their snapshots; catalog edits do not rewrite them.
- Leaving the editor with unsaved changes asks before discarding them. Refreshing or closing the browser also uses its standard unsaved-change warning.

The current scope is product and variant management within existing categories. Category creation, image uploads, bulk editing, and audit history are separate future features.

## Backend contract

All routes below require the verified owner identity through the existing /api/admin/** authorization rule:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/admin/products?search=&page=0&size=20 | Search and page products |
| GET | /api/admin/products/categories | Existing category choices |
| GET | /api/admin/products/{id} | Fresh editable product |
| POST | /api/admin/products | Create a product and its variants |
| PUT | /api/admin/products/{id} | Replace editable product details and variant set |
| DELETE | /api/admin/products/{id}?revision=... | Delete the product and its variants |

Admin responses are explicit DTOs, not serialized JPA entities. A PUT keeps the IDs of included variants, creates rows whose IDs are null, and removes omitted variants. Variant IDs must belong to the product being edited. Do not remove IDs from existing variants to change their details.

Reads return an opaque revision fingerprint of the editable catalog state. PUT includes that revision in its body; DELETE sends it as a query parameter. A database row lock serializes updates to a product, and a revision mismatch returns 409 instead of overwriting newer changes. The editor retains unsaved fields and offers Reload product. Reloading asks before discarding dirty fields.

Validation runs before mutations, and the entire product save/delete is transactional. Prices allow two decimal places, from 0 through 99999999.99; stock is a whole number from 0 through 2147483647. There is no fixed value-count, combination-count, or variant-count limit; each product allows up to 20 option names, with batch generation and paged display. Invalid details return 400; duplicate SKUs and stale edits return 409; missing products return 404. Anonymous requests return 401 and other accounts return 403.

Public product repository export is explicitly disabled. Storefront catalog reads continue through ProductController. Browser mutation preflights are allowed only for configured origins; actual mutations still require the owner bearer token.

## Database setup

Apply product-admin-migration.sql before using management on another database. It adds a unique SKU index so concurrent requests cannot create duplicate SKUs, and removes legacy order-item foreign keys to catalog product/variant IDs. Those IDs remain stored as snapshots; their saved values and the order relationship are retained. The SKU column must use a case-insensitive collation. Check existing duplicates before applying; do not silently rename or delete catalog records.

The local development migration has already been applied. It adds the SKU index and removes the legacy snapshot constraint; no catalog or order records are changed.

From backend/spring-boot-website, the local-only helper can inspect or apply the migration:

~~~powershell
java --class-path C:/Users/roebu/.m2/repository/com/mysql/mysql-connector-j/9.6.0/mysql-connector-j-9.6.0.jar CatalogAdminSchema.java
java --class-path C:/Users/roebu/.m2/repository/com/mysql/mysql-connector-j/9.6.0/mysql-connector-j-9.6.0.jar CatalogAdminSchema.java --apply
~~~

The helper reads ignored local settings, refuses remote databases, checks collation, duplicates, and the exact legacy foreign-key columns, and skips changes that are already installed. It refuses unexpected catalog foreign keys rather than dropping them blindly. For production, inspect the existing constraints and use your normal database migration process with the supplied SQL. Skip its CREATE INDEX statement if the unique SKU index is already installed. The earlier product-variant-options migration is also required.

## Manual verification

1. Restart the backend, refresh the frontend, sign in as owner, and open Admin.
2. Add a disposable product in an existing category, enter its price and stock, and define Color values Black, White. Save, then open its storefront product page and select each option.
3. Edit a price, stock count, image URL, and availability. Save and return to the list; open the product again and check persistence.
4. Try a duplicate SKU, negative price, fractional stock, inconsistent option names, and duplicate option combinations. Confirm a useful validation message and no partial database changes.
5. Open the same product in two tabs. Save a change in the first tab, then try saving or deleting from the second. Confirm the stale edit is rejected and Reload product fetches the current version.
6. Remove a variant and save. Delete the disposable product and confirm it is absent from storefront results. Existing order history must retain its original purchase details.
7. Sign in as a customer and open /admin. Confirm denial; direct management API requests must also be denied.

## Automated verification

Backend: run .\\mvnw.cmd test from the backend directory. AdminProductIntegrationTest covers CRUD, authorization, validation, transactional behavior, variant ownership, revisions, snapshots, and CORS using an isolated H2 database.

Frontend: the focused owner suite now includes the admin component and API service tests. Use the PowerShell test command in OWNER-ACCESS.md from the frontend directory, then run npm run build.
