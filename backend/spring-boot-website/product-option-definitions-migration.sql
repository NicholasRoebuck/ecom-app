-- Nullable editor configuration; existing variants and storefront responses are unchanged.
ALTER TABLE product ADD COLUMN variant_configuration TEXT NULL;
