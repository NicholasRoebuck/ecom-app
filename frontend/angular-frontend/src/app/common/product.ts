import { ProductVariant } from './product-variant';

export class Product {

    constructor(
    public id: number,
    public name: string,
    public description: string,
    public dateCreated: Date,
    public lastUpdated: Date,
    public variants: ProductVariant[]
    ){
    }
}