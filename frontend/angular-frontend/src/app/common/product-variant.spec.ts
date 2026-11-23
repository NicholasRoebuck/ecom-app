import { ProductVariant } from './product-variant';
describe('ProductVariant', () => {
  it('retains inventory, price and selected options', () => {
    const variant = new ProductVariant(42, 'FRAME-BLACK', 12.5, 'image', true, 3, {Color: 'Black'});
    expect(variant.id).toBe(42); expect(variant.sku).toBe('FRAME-BLACK'); expect(variant.unitPrice).toBe(12.5);
    expect(variant.imageUrl).toBe('image'); expect(variant.active).toBeTrue(); expect(variant.unitsInStock).toBe(3);
    expect(variant.options).toEqual({Color: 'Black'});
  });
  it('gives variants independent empty option maps when omitted', () => {
    const first = new ProductVariant(1, 'ONE', 10, '', true, 1);
    const second = new ProductVariant(2, 'TWO', 10, '', false, 0);
    first.options['Color'] = 'Black'; expect(second.options).toEqual({});
    expect(second.active).toBeFalse(); expect(second.unitsInStock).toBe(0);
  });
});
