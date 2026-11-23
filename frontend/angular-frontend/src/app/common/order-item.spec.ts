import { OrderItem } from './order-item';
import { CartItem } from './cart-item';
describe('OrderItem', () => {
  it('copies product identity, image, price and quantity from the cart', () => {
    const cart: CartItem = {id: '7', variantId: 42, name: 'Glasses', imageUrl: 'image', unitPrice: 12.5, quantity: 2};
    const line = new OrderItem(cart);
    expect(line.productId).toBe('7'); expect(line.imageUrl).toBe('image');
    expect(line.unitPrice).toBe(12.5); expect(line.quantity).toBe(2);
    cart.quantity = 3; expect(line.quantity).toBe(2);
  });
});
