# Product variations

Each product variant can define any named options using a string map:

```json
{
  "id": 123,
  "sku": "EXAMPLE-BLACK-M",
  "options": {
    "Color": "Black",
    "Size": "Medium"
  }
}
```

This is an illustrative catalog response, not an existing product or a new public write endpoint.
The owner can use Size, Color, Lens type, Fit, or other product-specific names without changing the schema.
No option values or extra variants have been invented for existing products.

## Storage and setup

Apply product-variant-options-migration.sql before starting the updated backend. It creates
product_variant_option with variant_id, option_name, and option_value, and widens order_item.product_name
to TEXT so saved option labels fit. The local development migration is already applied.

From this backend directory:

```powershell
java --class-path C:/Users/roebu/.m2/repository/com/mysql/mysql-connector-j/9.6.0/mysql-connector-j-9.6.0.jar VariantOptionsSchema.java --apply
```

Without --apply, the helper only inspects the schema. It reads ignored local properties and refuses remote
databases. It matches the foreign-key signedness to product_variant.id. For a manual/production migration,
match that type before executing the SQL. No products, stock, prices, or option values are changed by the helper.

The entity exposes variant.setOptions(Map.of("Color", "Black", "Size", "Medium")).
The owner-only admin editor manages this map through explicit admin controllers and the internal repositories.
See PRODUCT-MANAGEMENT.md for management behavior and the SKU uniqueness migration, and VARIANT-BUILDER.md for comma-separated product choices, batch generation, Customize overrides, and configuration storage migrations.

## Configuration rules

- Option names are case-sensitive, up to 64 characters; values are up to 128 characters.
- Use the same nonempty option names for every variant of one product.
- Each combination should identify exactly one variant, with its own SKU, price, image, active flag, and stock.
- Only create actual purchasable combinations. There is no automatic Cartesian-product generation.
- Products may use completely different option names from other products.
- Product-wide option names currently sort alphabetically. Dropdown values follow the supplied variant data.
- Dropdowns are the initial presentation for all attributes. Future size buttons or labeled color swatches
  can use the same model without changing the selected variant ID or checkout contract.

## Customer behavior

Single-variant products need no selector. Multiple variants require a choice; catalog cards link to
Choose options rather than adding the first variant. Complete, unique attribute maps produce separate
dropdowns. Changing an earlier option clears later selections, and unavailable combinations are disabled.

Legacy variants without option maps, inconsistent maps, or duplicate combinations use a single explicit
Variation selector with existing SKU/option labels. No size or color is inferred. Configure real option maps
to replace that fallback. Selecting a variant updates price, image and availability. Before selection the
price is labeled From. Missing products show an error instead of stale product data.

CartItem requires explicit selection for multiple variants and copies the actual variant belonging to the
product. Different variant IDs remain separate cart lines. Options are included in the authoritative backend
quote name and in the saved order item name, so refreshing cart prices does not erase the selection label.
Existing pending orders retain their original saved labels. Backend pricing and stock checks continue to use
only the submitted variant ID and quantity, never browser prices or option labels.

## Verification

Backend: .\mvnw.cmd test

Frontend build: npm run build -- --configuration development

Frontend regression suite (from frontend/angular-frontend):

```powershell
npm test -- --ts-config=tsconfig.products-spec.json --watch=false --browsers=ChromeHeadless --include=src/app/components/product-details/product-details.component.spec.ts --include=src/app/components/product-list/product-list-variants.spec.ts --include=src/app/common/cart-item.spec.ts --include=src/app/services/pending-checkout.service.spec.ts --include=src/app/services/auth-interceptor.service.spec.ts --include=src/app/services/order-history.service.spec.ts --include=src/app/components/order-history/order-history.component.spec.ts --include=src/app/components/checkout/checkout.component.spec.ts --include=src/app/components/cart-details/cart-details.component.spec.ts --include=src/app/services/checkout.service.spec.ts
```

Tests use illustrative options in isolated fixtures; they do not seed or alter the live development catalog.
Integration coverage verifies option persistence, the public detail response, backend quote labels, and the
immutable selected-option snapshot after catalog data changes.
