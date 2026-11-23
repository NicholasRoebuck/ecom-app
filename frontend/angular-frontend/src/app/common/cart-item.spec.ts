import { CartItem } from './cart-item';
import { Product } from './product';
import { ProductVariant } from './product-variant';

describe('CartItem selected variant', () => {
  const variants = [
    new ProductVariant(1, 'S', 10, 'small.png', true, 3, {Size: 'Small'}),
    new ProductVariant(2, 'M', 15, 'medium.png', true, 3, {Size: 'Medium'})
  ];
  const product = new Product(7, 'Shirt', '', new Date(), new Date(), variants);
  it('requires an explicit choice for products with multiple variants', () => {
    expect(() => new CartItem(product)).toThrowError(/Choose product options/);
  });
  it('copies the canonical selected variant rather than trusting supplied prices', () => {
    const item = new CartItem(product, {...variants[1], unitPrice: 0.01});
    expect(item.variantId).toBe(2);
    expect(item.unitPrice).toBe(15);
    expect(item.imageUrl).toBe('medium.png');
    expect(item.name).toBe('Shirt (Size: Medium)');
  });
  it('rejects a variant from another product', () => {
    expect(() => new CartItem(product, {...variants[0], id: 999})).toThrowError(/does not belong/);
  });
  it('supports existing single-variant products', () => {
    expect(new CartItem({...product, variants: [variants[0]]}).variantId).toBe(1);
  });
});
