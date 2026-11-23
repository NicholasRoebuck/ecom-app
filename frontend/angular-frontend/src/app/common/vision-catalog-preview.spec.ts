import { withVisionPreviewImage } from './vision-catalog-preview';
import { Product } from './product';
describe('Vision catalog preview images', () => {
  const fixture = () => ({id:157,name:'Shooting Glasses Item 1',variants:[{id:103,sku:'test-sku-157',imageUrl:'/assets/images/products/placeholder.png',unitPrice:123,unitsInStock:7,active:true,options:{}}]} as Product);
  it('assigns photography without mutating server prices, stock or the original product', () => {
    const original=fixture(), result=withVisionPreviewImage(original);
    expect(result.variants[0].imageUrl).toContain('/pilla/15cihc.png');
    expect(result.variants[0].unitPrice).toBe(123); expect(result.variants[0].unitsInStock).toBe(7);
    expect(original.variants[0].imageUrl).toContain('/placeholder.png');
  });
  it('leaves other departments and genuine catalog images unchanged', () => {
    const hearing=fixture(); hearing.name='Hearing Aids Item 1'; expect(withVisionPreviewImage(hearing)).toBe(hearing);
    const real=fixture(); real.variants[0].imageUrl='/real-photo.jpg'; expect(withVisionPreviewImage(real).variants[0].imageUrl).toBe('/real-photo.jpg');
    const other=fixture(); other.id=900; expect(withVisionPreviewImage(other)).toBe(other);
  });
});
