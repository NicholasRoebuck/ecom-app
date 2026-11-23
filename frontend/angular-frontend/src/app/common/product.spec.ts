import { Product } from './product';
import { ProductVariant } from './product-variant';
describe('Product', () => {
  it('retains catalog details, dates and variants', () => {
    const created = new Date('2026-01-01T00:00:00Z'); const updated = new Date('2026-01-02T00:00:00Z');
    const variants = [new ProductVariant(42, 'FRAME', 12.5, 'image', true, 3)];
    const product = new Product(7, 'Glasses', 'Black frames', created, updated, variants);
    expect(product.id).toBe(7); expect(product.name).toBe('Glasses'); expect(product.description).toBe('Black frames');
    expect(product.dateCreated).toBe(created); expect(product.lastUpdated).toBe(updated); expect(product.variants).toEqual(variants);
  });
});
