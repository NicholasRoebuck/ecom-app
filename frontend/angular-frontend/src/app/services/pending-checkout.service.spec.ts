import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { CartService } from './cart.service';
import { CheckoutService } from './checkout.service';
import { PendingCheckoutService } from './pending-checkout.service';
import { CheckoutSummary } from '../common/checkout';

describe('PendingCheckoutService automatic cart synchronization', () => {
  let service: PendingCheckoutService;
  let api: jasmine.SpyObj<CheckoutService>;
  let cart: any;
  const key = 'premearPendingCheckout:guest';
  const saved: CheckoutSummary = {checkoutToken: 'saved-token', orderTrackingNumber: 'tracking', status: 'PAYMENT_FAILED',
    currency: 'usd', totalPrice: 20, totalQuantity: 2,
    items: [{variantId: 42, quantity: 2, unitPrice: 10, subtotal: 20, name: 'Old item', sku: 'sku', imageUrl: ''}]};

  beforeEach(() => {
    sessionStorage.removeItem(key);
    api = jasmine.createSpyObj('CheckoutService', ['resume', 'cancel']);
    api.resume.and.returnValue(of({...saved}));
    api.cancel.and.returnValue(of(undefined));
    cart = {cartItems: [{variantId: 42, quantity: 2}], totalQuantity: new BehaviorSubject(2)};
    TestBed.configureTestingModule({providers: [
      {provide: CartService, useValue: cart}, {provide: CheckoutService, useValue: api},
      {provide: AuthService, useValue: {isLoading$: of(false), user$: of(null)}}
    ]});
    service = TestBed.inject(PendingCheckoutService);
  });
  afterEach(() => { sessionStorage.removeItem(key); sessionStorage.removeItem('premearPendingCheckout:account:bob'); });

  it('cancels an unpaid checkout when cart contents change on another page', fakeAsync(() => {
    service.start();
    flushMicrotasks();
    sessionStorage.setItem(key, saved.checkoutToken);
    cart.cartItems = [{variantId: 99, quantity: 2}];
    cart.totalQuantity.next(2);
    flushMicrotasks();
    expect(api.cancel).toHaveBeenCalledWith(saved.checkoutToken);
    expect(sessionStorage.getItem(key)).toBeNull();
    expect(cart.cartItems).toEqual([{variantId: 99, quantity: 2}]);
  }));

  it('preserves an unchanged order even if item prices differ', fakeAsync(() => {
    sessionStorage.setItem(key, saved.checkoutToken);
    cart.cartItems[0].unitPrice = 99;
    service.start();
    flushMicrotasks();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe(saved.checkoutToken);
  }));

  it('does not cancel paid or processing payments', fakeAsync(() => {
    for (const status of ['PAID', 'PROCESSING']) {
      api.resume.and.returnValue(of({...saved, status}));
      cart.cartItems = [{variantId: 99, quantity: 1}];
      void service.reconcile(saved.checkoutToken);
      flushMicrotasks();
    }
    expect(api.cancel).not.toHaveBeenCalled();
  }));

  it('keeps uncertain attempts recoverable', fakeAsync(() => {
    sessionStorage.setItem(key, saved.checkoutToken);
    cart.cartItems = [];
    api.resume.and.returnValue(throwError(() => ({status: 0})));
    service.start();
    flushMicrotasks();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key)).toBe(saved.checkoutToken);
  }));

  it('does not inspect another account recovery slot', fakeAsync(() => {
    sessionStorage.setItem('premearPendingCheckout:account:bob', saved.checkoutToken);
    cart.cartItems = [];
    service.start();
    flushMicrotasks();
    expect(api.resume).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('premearPendingCheckout:account:bob')).toBe(saved.checkoutToken);
  }));

  it('exposes recovery only for the active account slot', fakeAsync(() => {
    sessionStorage.setItem('premearPendingCheckout:account:bob', saved.checkoutToken);
    service.start(); flushMicrotasks();
    expect(service.hasPendingCheckout).toBeFalse();
    sessionStorage.setItem(key, saved.checkoutToken);
    expect(service.hasPendingCheckout).toBeTrue();
    sessionStorage.removeItem(key);
    expect(service.hasPendingCheckout).toBeFalse();
  }));

  it('shares concurrent recovery work rather than issuing duplicate cancellations', fakeAsync(() => {
    cart.cartItems = [];
    const first = service.reconcile(saved.checkoutToken);
    const second = service.reconcile(saved.checkoutToken);
    expect(first).toBe(second);
    flushMicrotasks();
    expect(api.resume).toHaveBeenCalledTimes(1);
    expect(api.cancel).toHaveBeenCalledTimes(1);
  }));
});
