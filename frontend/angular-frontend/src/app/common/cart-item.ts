import { Product } from "./product";
import { ProductVariant } from "./product-variant";
import { variantLabel, getDisplayVariant } from "./product-variant-utils";

export class CartItem {
    id: string;
    variantId: number;
    available?: boolean;
    availabilityMessage?: string;
    name: string;
    imageUrl: string;
    unitPrice: number;
    quantity: number;

    constructor(product: Product, selectedVariant?: ProductVariant){
        if (!selectedVariant && product.variants.length > 1) throw new Error("Choose product options before adding to cart.");
        this.id = product.id+"";
        this.name = product.name;

        const variant = selectedVariant ? product.variants.find(item => item.id === selectedVariant.id) : getDisplayVariant(product);
        if (!variant) throw new Error("The selected variant does not belong to this product.");
        const label = variantLabel(variant.options) || (product.variants.length > 1 ? variant.sku : "");
        this.name = product.name + (label ? " (" + label + ")" : "");
        this.variantId = variant?.id;
        this.imageUrl = variant ? variant.imageUrl : '';
        this.unitPrice = variant ? variant.unitPrice : 0;

        this.quantity = 1;

    }
}
