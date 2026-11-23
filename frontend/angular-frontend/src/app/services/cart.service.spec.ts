import { CartService } from './cart.service';
import { CartQuote } from '../common/checkout';

describe('CartService saved cart recovery', () => {
  const item = {id: '7', variantId: 42, name: 'Glasses', imageUrl: 'image', unitPrice: 12.5, quantity: 2};
  let saved: string | null;
  beforeEach(() => {
    saved = localStorage.getItem('cartItems'); localStorage.removeItem('cartItems');
    spyOn(CartService.prototype, 'logCartData');
  });
  afterEach(() => {
    if (saved === null) localStorage.removeItem('cartItems'); else localStorage.setItem('cartItems', saved);
  });
  function restore(value: unknown): CartService {
    localStorage.setItem('cartItems', JSON.stringify(value)); return new CartService();
  }

  it('recovers from invalid JSON and replaces the corrupted cache', () => {
    localStorage.setItem('cartItems', '{');
    const service = new CartService();
    expect(service.cartItems).toEqual([]);
    expect(localStorage.getItem('cartItems')).toBe('[]');
  });
  it('rejects non-array storage without crashing', () => {
    for (const value of [null, {}, 'cart', 4, true]) expect(restore(value).cartItems).toEqual([]);
  });
  it('retains valid entries from a partly corrupted cart and publishes their totals', () => {
    const service = restore([null, {}, [], item, {...item, variantId: -1}]);
    expect(service.cartItems).toEqual([item]);
    service.totalPrice.subscribe(total => expect(total).toBe(25));
    service.totalQuantity.subscribe(total => expect(total).toBe(2));
    expect(JSON.parse(localStorage.getItem('cartItems'))).toEqual([item]);
  });
  it('rejects invalid identifiers, quantities, and prices', () => {
    const invalid = [
      {id: ''}, {id: '0'}, {id: 'abc'}, {id: '9007199254740992'},
      {variantId: undefined}, {variantId: '42'}, {variantId: 0}, {variantId: 1.5},
      {quantity: 0}, {quantity: -1}, {quantity: 1.5}, {quantity: 1000}, {quantity: '2'},
      {unitPrice: -1}, {unitPrice: '12.5'}, {unitPrice: null}, {unitPrice: Number.MAX_VALUE}
    ];
    expect(restore(invalid.map(fields => ({...item, ...fields}))).cartItems).toEqual([]);
  });
  it('normalizes numeric product IDs and recovers missing display fields', () => {
    expect(restore([{...item, id: 7, name: null, imageUrl: {}}]).cartItems)
      .toEqual([{...item, name: 'Product', imageUrl: ''}]);
  });
  it('merges duplicate lines without restoring quantities above the checkout limit', () => {
    expect(restore([item, item]).cartItems).toEqual([{...item, quantity: 4}]);
    expect(restore([{...item, quantity: 999}, item]).cartItems).toEqual([{...item, quantity: 999}]);
  });
  it('keeps cart usable when accessing localStorage itself throws', () => {
    const access = spyOnProperty(window, 'localStorage', 'get').and.throwError('SecurityError');
    try {
      const service = new CartService(); service.addToCart({...item});
      expect(service.cartItems).toEqual([item]);
    } finally { access.and.callThrough(); }
  });
  it('keeps unreadable saved data intact while allowing in-memory cart changes', () => {
    const original = JSON.stringify([{...item, quantity: 3}]);
    localStorage.setItem('cartItems', original);
    const read = spyOn(Storage.prototype, 'getItem').and.throwError('Storage blocked');
    const write = spyOn(Storage.prototype, 'setItem').and.callThrough();
    const service = new CartService();
    service.addToCart({...item});
    expect(service.cartItems).toEqual([item]);
    expect(write).not.toHaveBeenCalled();
    read.and.callThrough();
    expect(localStorage.getItem('cartItems')).toBe(original);
  });
  it('keeps cart usable when writing storage fails', () => {
    localStorage.setItem('cartItems', JSON.stringify([item]));
    const write = spyOn(Storage.prototype, 'setItem').and.throwError('Quota exceeded');
    try {
      const service = new CartService();
      service.addToCart({...item});
      expect(service.cartItems[0].quantity).toBe(3);
      service.remove(service.cartItems[0]); expect(service.cartItems).toEqual([]);
    } finally { write.and.callThrough(); }
  });
  it('does not trust cached availability and replaces cached prices with server quotes', () => {
    const service = restore([{...item, available: true, availabilityMessage: 'cached', unitPrice: 0.01}]);
    expect(service.cartItems[0].available).toBeUndefined();
    const quote: CartQuote = {currency: 'usd', totalPrice: 30, totalQuantity: 2, available: true,
      items: [{variantId: 42, quantity: 2, unitPrice: 15, subtotal: 30, name: 'Glasses', sku: 'SKU', imageUrl: 'image', available: true, message: ''}]};
    service.applyQuote(quote);
    expect(service.cartItems[0].unitPrice).toBe(15);
    expect(service.cartItems[0].available).toBeTrue();
    service.totalPrice.subscribe(total => expect(total).toBe(30));
  });
});
