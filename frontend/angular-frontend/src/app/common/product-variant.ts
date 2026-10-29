export class ProductVariant {

    constructor(
    public id: number,
    public sku: string,
    public unitPrice: number,
    public imageUrl: string,
    public active: boolean,
    public unitsInStock: number) {
    }
}
