import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { CartDetailsComponent } from './cart-details.component';
import { CartService } from '../../services/cart.service';
import { CheckoutService } from '../../services/checkout.service';
import { CartQuote } from '../../common/checkout';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { PendingCheckoutService } from '../../services/pending-checkout.service';

describe('CartDetailsComponent automatic pricing', () => {
  let component: CartDetailsComponent;
  let cart: CartService;
  let api: jasmine.SpyObj<CheckoutService>;
  let saved: string | null;
  let pending: {hasPendingCheckout: boolean};
  const quote: CartQuote = {
    currency: 'usd', totalPrice: 250, totalQuantity: 2, available: true,
    items: [{variantId: 42, sku: 'SKU', name: 'Glasses', imageUrl: 'image',
      unitPrice: 125, quantity: 2, subtotal: 250, available: true, message: ''}]
  };

  beforeEach(() => {
    saved = localStorage.getItem('cartItems');
    localStorage.removeItem('cartItems');
    cart = new CartService();
    spyOn(cart, 'logCartData');
    cart.cartItems = [{id: '7', variantId: 42, name: 'Glasses', imageUrl: '', unitPrice: 120, quantity: 2}];
    api = jasmine.createSpyObj('CheckoutService', ['quote']);
    api.quote.and.returnValue(of(quote));
    pending = {hasPendingCheckout: false};
    TestBed.configureTestingModule({imports: [CommonModule, RouterTestingModule], declarations: [CartDetailsComponent], providers: [
      {provide: PendingCheckoutService, useValue: pending},
      CartDetailsComponent, {provide: CartService, useValue: cart}, {provide: CheckoutService, useValue: api}
    ]});
    component = TestBed.inject(CartDetailsComponent);
  });
  afterEach(() => {
    if (saved === null) localStorage.removeItem('cartItems');
    else localStorage.setItem('cartItems', saved);
  });

  it('refreshes and persists database prices on opening the cart and explains the change', () => {
    component.ngOnInit();
    expect(api.quote).toHaveBeenCalledWith([{variantId: 42, quantity: 2}]);
    expect(cart.cartItems[0].unitPrice).toBe(125);
    expect(component.totalPrice).toBe(250);
    expect(component.changes).toEqual([{name: 'Glasses', previous: 120, current: 125}]);
    expect(component.pricingReady).toBeTrue();
    expect(JSON.parse(localStorage.getItem('cartItems'))[0].unitPrice).toBe(125);
  });

  it('blocks checkout while leaving unavailable items removable', () => {
    api.quote.and.returnValue(of({...quote, available: false,
      items: [{...quote.items[0], available: false, message: 'Only 1 available.'}]}));
    component.ngOnInit();
    expect(component.pricingReady).toBeFalse();
    expect(cart.cartItems[0].availabilityMessage).toBe('Only 1 available.');
    component.remove(cart.cartItems[0]);
    expect(cart.cartItems.length).toBe(0);
  });

  it('blocks checkout on failed refresh and allows retry', () => {
    api.quote.and.returnValue(throwError(() => ({status: 0})));
    component.ngOnInit();
    expect(component.pricingReady).toBeFalse();
    expect(component.refreshing).toBeFalse();
    expect(component.error).toContain('Could not check');
    api.quote.and.returnValue(of(quote));
    component.refreshPrices();
    expect(component.pricingReady).toBeTrue();
  });

  it('keeps saved checkout recovery available when its reserved stock is unavailable to a new quote', () => {
    pending.hasPendingCheckout = true;
    api.quote.and.returnValue(of({...quote, available: false,
      items: [{...quote.items[0], available: false, message: 'Only 0 available.'}]}));
    const fixture = TestBed.createComponent(CartDetailsComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.pricingReady).toBeFalse();
    const recovery = fixture.nativeElement.querySelector('a[routerLink="/checkout"]');
    expect(recovery?.textContent).toContain('Resume checkout');
  });

  it('does not show saved checkout recovery for an unrelated cart', () => {
    const fixture = TestBed.createComponent(CartDetailsComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Resume checkout');
  });

  it('does not call the API for an empty cart', () => {
    cart.cartItems = [];
    component.ngOnInit();
    expect(api.quote).not.toHaveBeenCalled();
  });
});
