import { Product } from './product';
import { ProductVariant } from './product-variant';

/**
 * Picks which variant represents a product on cards/detail pages that don't
 * yet have a variant selector. Currently just the first variant - once a
 * real selector exists, swap this for whatever the user has picked instead
 * of calling this function.
 */
export function getDisplayVariant(product: Product): ProductVariant | undefined {
    return product.variants && product.variants.length > 0
        ? product.variants[0]
        : undefined;
}