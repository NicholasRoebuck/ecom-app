import { Product } from "./product";
import { getDisplayVariant } from "./product-variant-utils";

export class CartItem {
    id: string;
    name: string;
    imageUrl: string;
    unitPrice: number;
    quantity: number;

    constructor(product: Product){
        this.id = product.id+"";
        this.name = product.name;

        const variant = getDisplayVariant(product);
        this.imageUrl = variant ? variant.imageUrl : '';
        this.unitPrice = variant ? variant.unitPrice : 0;

        this.quantity = 1;

    }
}
