import { ProductCategory } from './product-category';
describe('ProductCategory', () => {
  it('retains the category identifier and display name', () => {
    const category = new ProductCategory(1, 'Eyewear');
    expect(category.id).toBe(1); expect(category.categoryName).toBe('Eyewear');
  });
});
