import { ProductCategoryNav } from './product-category-nav';
describe('ProductCategoryNav', () => {
  it('retains category identity and whether children exist', () => {
    const category = new ProductCategoryNav(1, 'Eyewear', true);
    expect(category.id).toBe(1); expect(category.categoryName).toBe('Eyewear'); expect(category.hasChildren).toBeTrue();
    expect(new ProductCategoryNav(2, 'Frames', false).hasChildren).toBeFalse();
  });
});
