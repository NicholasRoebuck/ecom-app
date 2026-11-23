import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness, RouterTestingModule } from '@angular/router/testing';
import { AuthGuard, AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, of } from 'rxjs';
import { appRoutes } from './app.routes';
import { CheckoutComponent } from './components/checkout/checkout.component';
import { OrderHistoryComponent } from './components/order-history/order-history.component';
import { MembersPageComponent } from './components/members-page/members-page.component';
import { CartService } from './services/cart.service';
import { CheckoutService } from './services/checkout.service';
import { FormServiceService } from './services/form-service.service';
import { OrderHistoryService } from './services/order-history.service';
import { ProductService } from './services/product.service';

describe('Lazy checkout and account routes', () => {
  let authenticated: BehaviorSubject<boolean>;
  let auth: any;
  let cart: any;
  let checkout: jasmine.SpyObj<CheckoutService>;
  let orders: jasmine.SpyObj<OrderHistoryService>;
  let savedToken: string | null;
  let legacyToken: string | null;
  const token = '11111111-1111-4111-8111-111111111111';
  const summary = {checkoutToken: token, orderTrackingNumber: 'tracking', status: 'PENDING', currency: 'usd',
    totalPrice: 20, totalQuantity: 2,
    items: [{variantId: 42, productId: 7, name: 'Glasses', sku: 'FRAME', imageUrl: '', quantity: 2, unitPrice: 10, subtotal: 20}]};
  beforeEach(() => {
    savedToken = sessionStorage.getItem('premearPendingCheckout:guest');
    legacyToken = sessionStorage.getItem('premearPendingCheckout');
    sessionStorage.removeItem('premearPendingCheckout:guest'); sessionStorage.removeItem('premearPendingCheckout');
    authenticated = new BehaviorSubject(false);
    auth = {isAuthenticated$: authenticated, isLoading$: of(false), user$: of(null),
      loginWithRedirect: jasmine.createSpy('loginWithRedirect').and.returnValue(of(undefined))};
    cart = {cartItems: [{id: '7', variantId: 42, name: 'Glasses', imageUrl: '', quantity: 2, unitPrice: 10}],
      totalPrice: new BehaviorSubject(20), totalQuantity: new BehaviorSubject(2),
      applyQuote: jasmine.createSpy('applyQuote').and.returnValue([]), clearCart: jasmine.createSpy('clearCart')};
    checkout = jasmine.createSpyObj('CheckoutService', ['quote', 'resume', 'details', 'cancel', 'review', 'createPaymentIntent', 'placeOrder']);
    checkout.quote.and.returnValue(of({...summary, available: true,
      items: summary.items.map(item => ({...item, available: true, message: ''}))}));
    checkout.resume.and.returnValue(of(summary));
    orders = jasmine.createSpyObj('OrderHistoryService', ['getOrderHistory']);
    orders.getOrderHistory.and.returnValue(of({content: [], page: {number: 0, size: 20, totalElements: 0, totalPages: 0}}));
    // Route tests exercise real initialization/recovery; Stripe mounting is covered separately.
    spyOn(CheckoutComponent.prototype, 'ngAfterViewInit').and.stub();
    TestBed.configureTestingModule({imports: [RouterTestingModule.withRoutes(appRoutes)], providers: [
      {provide: AuthService, useValue: auth}, {provide: CartService, useValue: cart},
      {provide: CheckoutService, useValue: checkout}, {provide: OrderHistoryService, useValue: orders},
      {provide: FormServiceService, useValue: {getCountries: () => of([]), getStates: () => of([])}},
      {provide: ProductService, useValue: {getTopLevelCategories: () => of([])}}
    ]});
  });
  afterEach(() => {
    if (savedToken === null) sessionStorage.removeItem('premearPendingCheckout:guest');
    else sessionStorage.setItem('premearPendingCheckout:guest', savedToken);
    if (legacyToken === null) sessionStorage.removeItem('premearPendingCheckout');
    else sessionStorage.setItem('premearPendingCheckout', legacyToken);
  });
  it('defines the three pages as lazy loaders and preserves the account guards', () => {
    for (const name of ['checkout', 'members', 'order-history']) {
      const route = appRoutes.find(route => route.path === name);
      expect(typeof route.loadComponent).toBe('function'); expect(route.component).toBeUndefined();
      if (name !== 'checkout') expect(route.canActivate).toEqual([AuthGuard]);
    }
  });
  it('opens checkout directly and checks prices without starting a payment', async () => {
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/checkout', CheckoutComponent);
    await harness.fixture.whenStable();
    expect(component).toBeTruthy(); expect(checkout.quote).toHaveBeenCalledWith([{variantId: 42, quantity: 2}]);
    expect(checkout.review).not.toHaveBeenCalled(); expect(checkout.createPaymentIntent).not.toHaveBeenCalled();
    expect(harness.routeDebugElement.injector.get(CartService)).toBe(cart);
  });
  it('restores a saved guest checkout when entering the lazy route directly', async () => {
    sessionStorage.setItem('premearPendingCheckout:guest', token);
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/checkout', CheckoutComponent);
    await harness.fixture.whenStable();
    expect(checkout.resume).toHaveBeenCalledWith(token);
    expect(component.summary.checkoutToken).toBe(token);
    expect(component.summary.totalPrice).toBe(20); expect(checkout.quote).not.toHaveBeenCalled();
    expect(checkout.createPaymentIntent).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(token);
  });
  for (const path of ['members', 'order-history']) {
    it('requires login for a direct /' + path + ' visit and retains the return URL', async () => {
      const harness = await RouterTestingHarness.create('/' + path);
      expect(harness.routeNativeElement).toBeNull();
      expect(auth.loginWithRedirect).toHaveBeenCalledWith({appState: {target: '/' + path}});
      expect(orders.getOrderHistory).not.toHaveBeenCalled();
    });
  }
  it('renders the lazy Members page for an authenticated visitor', async () => {
    authenticated.next(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/members', MembersPageComponent);
    expect(harness.routeNativeElement.textContent).toContain('Thank you for being a member');
    expect(auth.loginWithRedirect).not.toHaveBeenCalled();
  });
  it('renders the lazy Order History page and fetches the first account page', async () => {
    authenticated.next(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/order-history', OrderHistoryComponent);
    expect(orders.getOrderHistory).toHaveBeenCalledWith(0, 20);
    expect(harness.routeNativeElement.textContent).toContain('No orders found.');
  });
  it('keeps the same cart service and cart items when leaving and returning to checkout', async () => {
    authenticated.next(true);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/checkout', CheckoutComponent);
    const items = cart.cartItems;
    await harness.navigateByUrl('/members', MembersPageComponent);
    await harness.navigateByUrl('/checkout', CheckoutComponent);
    expect(harness.routeDebugElement.injector.get(CartService)).toBe(cart);
    expect(cart.cartItems).toBe(items); expect(cart.clearCart).not.toHaveBeenCalled();
  });
});
