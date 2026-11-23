import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { CheckoutComponent } from './checkout.component';
import { CartService } from '../../services/cart.service';
import { CheckoutService } from '../../services/checkout.service';
import { FormServiceService } from '../../services/form-service.service';
import { CheckoutSummary } from '../../common/checkout';

describe('CheckoutComponent verified pricing flow', () => {
  let component: CheckoutComponent;
  let api: jasmine.SpyObj<CheckoutService>;
  let cart: any;
  let auth: any;
  let forms: jasmine.SpyObj<FormServiceService>;
  const summary: CheckoutSummary = {
    checkoutToken: '11111111-1111-4111-8111-111111111111', orderTrackingNumber: 'tracking',
    status: 'PENDING', currency: 'usd', totalPrice: 20, totalQuantity: 2,
    items: [{ variantId: 42, sku: 'SKU', name: 'Glasses', imageUrl: '', unitPrice: 10, quantity: 2, subtotal: 20 }]
  };

  beforeEach(async () => {
    summary.status = 'PENDING';
    sessionStorage.removeItem('premearPendingCheckout:guest');
    sessionStorage.removeItem('premearPendingCheckout');
    sessionStorage.removeItem('premearPendingCheckout:account:alice');
    sessionStorage.removeItem('premearPendingCheckout:account:bob');
    auth = { isLoading$: of(false), user$: of(null) };
    api = jasmine.createSpyObj('CheckoutService', ['quote', 'review', 'resume', 'cancel', 'createPaymentIntent', 'placeOrder', 'details']);
    cart = {
      cartItems: [{ id: '7', variantId: 42, quantity: 2, unitPrice: 0.01 }],
      totalPrice: new BehaviorSubject(0.02), totalQuantity: new BehaviorSubject(2),
      clearCart: jasmine.createSpy('clearCart'),
      applyQuote: (quote: any) => {
        cart.cartItems[0].unitPrice = quote.items[0].unitPrice;
        cart.totalPrice.next(quote.totalPrice);
        return [];
      }
    };
    forms = jasmine.createSpyObj('FormServiceService', ['getCountries', 'getStates']);
    forms.getCountries.and.returnValue(of([]));
    forms.getStates.and.returnValue(of([]));
    TestBed.configureTestingModule({ imports: [CheckoutComponent, CommonModule, ReactiveFormsModule, RouterTestingModule], providers: [
      {provide: AuthService, useValue: auth},
      CheckoutComponent, FormBuilder,
      { provide: CartService, useValue: cart },
      { provide: CheckoutService, useValue: api },
      { provide: FormServiceService, useValue: forms }
    ] });
    api.quote.and.returnValue(of({...summary, available: true, items: summary.items.map(item => ({...item, available: true, message: ''}))}));
    component = TestBed.inject(CheckoutComponent);
    component.ngOnInit();
    await Promise.resolve();
    component.cardComplete = true;
    component.stripe = {};
    component.checkoutFormGroup.patchValue({
      customer: { firstName: 'Alex', lastName: 'Smith', email: 'alex@example.com' },
      shippingAddress: {street: '1 Main', city: 'LA', state: {name: 'CA'}, country: {name: 'US', code: 'US'}, zipCode: '90001'},
      billingAddress: {street: '1 Main', city: 'LA', state: {name: 'CA'}, country: {name: 'US', code: 'US'}, zipCode: '90001'}
    });
  });
  afterEach(() => { component.ngOnDestroy(); for (const key of ['premearPendingCheckout', 'premearPendingCheckout:guest', 'premearPendingCheckout:account:alice', 'premearPendingCheckout:account:bob']) sessionStorage.removeItem(key); });

  it('validates variant IDs and quantities and proceeds directly to payment when prices match', async () => {
    api.review.and.returnValue(of(summary));
    const pay = spyOn(component, 'pay').and.resolveTo();
    await component.onSubmit();
    const request = api.review.calls.mostRecent().args[0];
    expect(request.items).toEqual([{ variantId: 42, quantity: 2 }]);
    expect((request as any).amount).toBeUndefined();
    expect((request as any).order).toBeUndefined();
    expect(component.summary.totalPrice).toBe(20);
    expect(pay).toHaveBeenCalledTimes(1);
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('rejects legacy cart entries without a variant ID', async () => {
    cart.cartItems[0].variantId = undefined;
    await component.onSubmit();
    expect(api.review).not.toHaveBeenCalled();
    expect(component.checkoutError).toContain('Remove older items');
  });

  it('recovers the payment controls after an API failure and preserves the cart', async () => {
    component.summary = {...summary};
    component.cardComplete = true;
    component.stripe = {};
    api.createPaymentIntent.and.returnValue(throwError(() => ({error: {message: 'Try again'}})));
    await component.pay();
    expect(component.isDisabled).toBeFalse();
    expect(component.checkoutError).toBe('Try again');
    expect(cart.clearCart).not.toHaveBeenCalled();
    expect(api.placeOrder).not.toHaveBeenCalled();
  });

  it('does not confirm an order when Stripe requires further processing', async () => {
    component.summary = {...summary};
    component.cardComplete = true;
    component.stripe = {
      retrievePaymentIntent: () => Promise.resolve({ paymentIntent: {status: 'requires_payment_method'} }),
      confirmCardPayment: () => Promise.resolve({ paymentIntent: {status: 'processing'} })
    };
    api.createPaymentIntent.and.returnValue(of({clientSecret: 'secret'}));
    await component.pay();
    expect(api.placeOrder).not.toHaveBeenCalled();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('can confirm an already-paid intent without creating another charge', async () => {
    component.summary = {...summary};
    component.cardComplete = true;
    component.stripe = {
      retrievePaymentIntent: () => Promise.resolve({paymentIntent: {status: 'succeeded'}}),
      confirmCardPayment: jasmine.createSpy('confirmCardPayment')
    };
    api.createPaymentIntent.and.returnValue(of({clientSecret: 'secret'}));
    api.placeOrder.and.returnValue(of({orderTrackingNumber: 'tracking'}));
    await component.pay();
    expect(component.stripe.confirmCardPayment).not.toHaveBeenCalled();
    expect(api.placeOrder).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.confirmation).toBe('tracking');
    expect(cart.clearCart).toHaveBeenCalledTimes(1);
  });

  it('preserves a paid checkout when cancellation is refused', async () => {
    component.summary = {...summary};
    api.cancel.and.returnValue(throwError(() => ({error: {message: 'Already paid'}})));
    await component.editDetails();
    expect(component.summary).toEqual(summary);
    expect(component.checkoutError).toBe('Already paid');
  });
  it('keeps the request token after an uncertain review failure and blocks a second order', async () => {
    api.review.and.returnValue(throwError(() => ({status: 0})));
    await component.onSubmit();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBeTruthy();
    await component.onSubmit();
    expect(api.review).toHaveBeenCalledTimes(1);
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('recovers a paid order after refresh without making another payment', () => {
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.resume.and.returnValue(of({...summary, status: 'PAID'}));
    component.ngOnInit();
    expect(component.confirmation).toBe('tracking');
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBeNull();
  });

  it('clears the pending token only after the server cancels checkout', async () => {
    component.summary = {...summary};
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.cancel.and.returnValue(of(undefined));
    await component.editDetails();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.summary).toBeNull();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBeNull();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });
  it('pauses before payment when a price changes while the customer fills out checkout', async () => {
    api.review.and.returnValue(of({...summary, totalPrice: 22, items: [{...summary.items[0], unitPrice: 11, subtotal: 22}]}));
    const pay = spyOn(component, 'pay').and.resolveTo();
    await component.onSubmit();
    expect(component.summary.totalPrice).toBe(22);
    expect(component.priceChangeNotice).toContain('Prices changed while');
    expect(pay).not.toHaveBeenCalled();
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
    await component.onSubmit();
    expect(pay).toHaveBeenCalledTimes(1);
  });

  it('does not submit an order when the initial price check fails', async () => {
    api.quote.and.returnValue(throwError(() => ({status: 0})));
    await component.refreshPricing();
    await component.onSubmit();
    expect(component.pricingReady).toBeFalse();
    expect(api.review).not.toHaveBeenCalled();
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
  });
  it('does not reconfirm a payment that Stripe is already processing', async () => {
    component.summary = {...summary};
    component.stripe = {
      retrievePaymentIntent: () => Promise.resolve({paymentIntent: {status: 'processing'}}),
      confirmCardPayment: jasmine.createSpy('confirmCardPayment')
    };
    api.createPaymentIntent.and.returnValue(of({clientSecret: 'secret'}));
    await component.pay();
    expect(component.summary.status).toBe('PROCESSING');
    expect(component.paymentNotice).toContain('processing');
    expect(component.stripe.confirmCardPayment).not.toHaveBeenCalled();
    expect(api.placeOrder).not.toHaveBeenCalled();
    expect(cart.clearCart).not.toHaveBeenCalled();
    await component.onSubmit();
    expect(api.createPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('recovers a completed payment without requiring another card submission', async () => {
    component.summary = {...summary, status: 'PROCESSING'};
    api.resume.and.returnValue(of({...summary, status: 'PAID'}));
    await component.checkPayment();
    expect(api.resume).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.confirmation).toBe('tracking');
    expect(cart.clearCart).toHaveBeenCalledTimes(1);
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('shows a declined payment as retryable without clearing the cart', async () => {
    component.summary = {...summary};
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    await component.checkPayment();
    expect(component.paymentNotice).toContain('declined');
    expect(component.summary.checkoutToken).toBe(summary.checkoutToken);
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('lets a restored declined checkout reopen customer details after server cancellation', async () => {
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    component.ngOnInit();
    expect(component.paymentStarted).toBeTrue();
    expect(component.canEditDetails).toBeTrue();
    expect(component.paymentNotice).toContain('declined');
    api.cancel.and.returnValue(of(undefined));
    await component.editDetails();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.summary).toBeNull();
    expect(component.paymentNotice).toBe('');
    expect(component.paymentStarted).toBeFalse();
    expect(component.isDisabled).toBeFalse();
    expect(component.pricingReady).toBeTrue();
    expect(component.firstName.enabled).toBeTrue();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBeNull();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('does not offer editing or cancel an order already processing or paid', async () => {
    for (const status of ['PROCESSING', 'PAID']) {
      component.summary = {...summary, status};
      expect(component.canEditDetails).toBeFalse();
      await component.editDetails();
    }
    expect(api.cancel).not.toHaveBeenCalled();
  });

  it('preserves the recovered checkout when the server detects a payment in progress', async () => {
    component.summary = {...summary, status: 'PAYMENT_FAILED'};
    component.paymentStarted = true;
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.cancel.and.returnValue(throwError(() => ({error: {message: 'Payment is complete or processing.'}})));
    await component.editDetails();
    expect(component.summary.status).toBe('PAYMENT_FAILED');
    expect(component.paymentStarted).toBeTrue();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(summary.checkoutToken);
    expect(component.checkoutError).toContain('processing');
    expect(api.review).not.toHaveBeenCalled();
  });

  it('does not automatically restore an old unscoped checkout token', async () => {
    sessionStorage.setItem('premearPendingCheckout', summary.checkoutToken);
    component.ngOnInit();
    await Promise.resolve();
    expect(api.resume).not.toHaveBeenCalled();
    expect(component.summary).toBeNull();
    expect(component.legacyCheckoutAvailable).toBeTrue();
    expect(component.pricingReady).toBeTrue();
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    component.recoverPreviousCheckout();
    expect(component.summary.status).toBe('PAYMENT_FAILED');
    expect(sessionStorage.getItem('premearPendingCheckout')).toBeNull();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(summary.checkoutToken);
  });

  it('waits for identity and never restores another account or guest slot', async () => {
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    sessionStorage.setItem('premearPendingCheckout:account:alice', summary.checkoutToken);
    const loading = new BehaviorSubject(true);
    auth.isLoading$ = loading;
    auth.user$ = of({sub: 'bob', email: 'bob@example.com'});
    component.ngOnInit();
    expect(api.resume).not.toHaveBeenCalled();
    loading.next(false);
    await Promise.resolve();
    expect(api.resume).not.toHaveBeenCalled();
    expect(component.email.value).toBe('bob@example.com');
    expect(component.summary).toBeNull();
    expect(component.pricingReady).toBeTrue();
  });

  it('resets a missing saved checkout without leaving a recovery error', async () => {
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.resume.and.returnValue(throwError(() => ({status: 404})));
    component.ngOnInit();
    await Promise.resolve();
    expect(component.checkoutError).toBe('');
    expect(component.summary).toBeNull();
    expect(component.pricingReady).toBeTrue();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBeNull();
  });

  it('preserves a different cart when an older paid checkout is recovered', async () => {
    cart.cartItems = [{variantId: 99, quantity: 1}];
    component.summary = {...summary};
    api.resume.and.returnValue(of({...summary, status: 'PAID'}));
    await component.checkPayment();
    expect(component.confirmation).toBe('tracking');
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('reconciles a Stripe decline and replaces the stale notice on retry', async () => {
    component.summary = {...summary, status: 'PAYMENT_FAILED'};
    component.paymentNotice = 'Old decline message';
    component.stripe = {
      retrievePaymentIntent: () => Promise.resolve({paymentIntent: {status: 'requires_payment_method'}}),
      confirmCardPayment: () => Promise.resolve({error: {message: 'Card declined'}})
    };
    api.createPaymentIntent.and.returnValue(of({clientSecret: 'secret'}));
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    await component.pay();
    expect(api.resume).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.paymentError).toBe('Card declined');
    expect(component.paymentNotice).toContain('declined');
    component.stripe.confirmCardPayment = () => Promise.resolve({paymentIntent: {status: 'processing'}});
    await component.pay();
    expect(component.summary.status).toBe('PROCESSING');
    expect(component.paymentNotice).toContain('processing');
    expect(component.paymentNotice).not.toContain('declined');
    expect(component.checkoutError).toBe('');
  });

  it('keeps guest details expanded and blank when a declined checkout is recovered', fakeAsync(() => {
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    sessionStorage.setItem('userEmail', JSON.stringify('previous@example.com'));
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    spyOn(CheckoutComponent.prototype, 'ngAfterViewInit').and.resolveTo();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    const guest = fixture.componentInstance;
    expect(fixture.nativeElement.textContent).toContain('Review your order');
    expect(fixture.nativeElement.querySelector('fieldset').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBeFalse();
    expect(guest.firstName.value).toBe('');
    expect(guest.email.value).toBe('');
    expect(guest.shippingAddressStreet.value).toBe('');
    expect(guest.cardComplete).toBeFalse();
    expect(api.details).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('form').getAttribute('autocomplete')).toBe('off');
    sessionStorage.removeItem('userEmail');
    fixture.destroy();
  }));

  it('never replaces an active checkout with the older shared recovery token', () => {
    sessionStorage.setItem('premearPendingCheckout', 'older-token');
    component.summary = {...summary};
    component.recoverPreviousCheckout();
    expect(api.resume).not.toHaveBeenCalled();
    expect(component.summary.checkoutToken).toBe(summary.checkoutToken);
  });

  it('shows bank authentication separately from processing after card confirmation', async () => {
    component.summary = {...summary};
    component.stripe = {
      retrievePaymentIntent: () => Promise.resolve({paymentIntent: {status: 'requires_payment_method'}}),
      confirmCardPayment: () => Promise.resolve({paymentIntent: {status: 'requires_action'}})
    };
    api.createPaymentIntent.and.returnValue(of({clientSecret: 'secret'}));
    await component.pay();
    expect(component.summary.status).toBe('REQUIRES_ACTION');
    expect(component.paymentNotice).toContain('authentication');
    expect(api.placeOrder).not.toHaveBeenCalled();
  });

  it('renders one decline beneath the card field and retains guest details without a saved notice', fakeAsync(() => {
    spyOn(CheckoutComponent.prototype, 'ngAfterViewInit').and.resolveTo();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    flushMicrotasks();
    const checkout = fixture.componentInstance;
    checkout.checkoutFormGroup.patchValue(component.checkoutFormGroup.getRawValue());
    checkout.summary = {...summary, status: 'PAYMENT_FAILED'};
    checkout.cardComplete = true;
    checkout.stripe = {
      retrievePaymentIntent: () => Promise.resolve({paymentIntent: {status: 'requires_payment_method'}}),
      confirmCardPayment: () => Promise.resolve({error: {message: 'Your card has been declined.'}})
    };
    api.createPaymentIntent.and.returnValue(of({clientSecret: 'secret'}));
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    void checkout.pay();
    flushMicrotasks();
    fixture.detectChanges();
    const messages = Array.from(fixture.nativeElement.querySelectorAll('.alert'))
      .map((element: any) => element.textContent);
    expect(messages.filter(message => /declined/i.test(message)).length).toBe(1);
    expect(messages.some(message => message.includes('Your card has been declined.'))).toBeTrue();
    expect(messages.some(message => message.includes('Customer and delivery details for this order are saved.'))).toBeFalse();
    expect(fixture.nativeElement.querySelector('#card-errors').textContent).toContain('Your card has been declined.');
    expect(checkout.checkoutError).toBe('');
    expect(checkout.firstName.value).toBe('Alex');
    expect(fixture.nativeElement.querySelector('fieldset').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('.checkout-review p')).toBeNull();
    // A restored failed payment still needs its fallback notice when no Stripe error is available.
    checkout.paymentError = '';
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Your previous payment was declined.');
    checkout.onCardChange({complete: false, empty: true});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#card-errors')).toBeTruthy();
    checkout.onCardChange({complete: false, empty: false});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#card-errors')).toBeNull();
    expect(checkout.summary.status).toBe('PAYMENT_FAILED');
    checkout.onCardChange({complete: false, empty: false, error: {message: 'Your card number is incomplete.'}});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#card-errors').textContent).toContain('Your card number is incomplete.');

    fixture.destroy();
  }));

  it('automatically synchronizes changed quantities before allowing payment', async () => {
    component.summary = {...summary, status: 'PAYMENT_FAILED'};
    cart.cartItems[0].quantity = 1;
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    api.cancel.and.returnValue(of(undefined));
    expect(component.cartNeedsSync).toBeTrue();
    await component.onSubmit();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.summary).toBeNull();
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
    expect(cart.cartItems[0].quantity).toBe(1);
  });

  it('compares variants and quantities independent of item ordering and prices', () => {
    component.summary = {...summary, items: [
      {...summary.items[0], quantity: 1}, {...summary.items[0], variantId: 99, quantity: 2}
    ]};
    cart.cartItems = [{variantId: 99, quantity: 2, unitPrice: 999}, {variantId: 42, quantity: 1, unitPrice: 1}];
    expect(component.cartNeedsSync).toBeFalse();
    cart.cartItems[0].variantId = 100;
    expect(component.cartNeedsSync).toBeTrue();
  });

  it('closes a verified unpaid attempt before resetting checkout for the changed cart', async () => {
    component.summary = {...summary, status: 'PAYMENT_FAILED'};
    cart.cartItems[0].quantity = 1;
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    component.paymentNotice = 'Previous decline';
    component.checkoutError = 'Card declined';
    component.displayError = 'Card error';
    component.cardElement = {clear: jasmine.createSpy('clear'), destroy: () => {}};
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    api.cancel.and.callFake(() => {
      expect(api.resume).toHaveBeenCalledWith(summary.checkoutToken);
      expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(summary.checkoutToken);
      return of(undefined);
    });
    await component.syncChangedCart();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.summary).toBeNull();
    expect(component.paymentNotice).toBe('');
    expect(component.checkoutError).toBe('');
    expect(component.displayError).toBe('');
    expect(component.cardComplete).toBeFalse();
    expect(component.cardElement.clear).toHaveBeenCalled();
    expect(component.pricingReady).toBeTrue();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBeNull();
    expect(cart.cartItems[0].quantity).toBe(1);
    expect(cart.clearCart).not.toHaveBeenCalled();
    expect(api.review).not.toHaveBeenCalled();
    expect(api.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('preserves a processing attempt and its token instead of creating a new checkout', async () => {
    component.summary = {...summary};
    cart.cartItems[0].quantity = 1;
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.resume.and.returnValue(of({...summary, status: 'PROCESSING'}));
    await component.syncChangedCart();
    expect(component.summary.status).toBe('PROCESSING');
    expect(component.cartNeedsSync).toBeTrue();
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(summary.checkoutToken);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.review).not.toHaveBeenCalled();
  });

  it('confirms a payment that succeeded before replacement and preserves the changed cart', async () => {
    component.summary = {...summary};
    cart.cartItems[0].quantity = 1;
    api.resume.and.returnValue(of({...summary, status: 'PAID'}));
    await component.syncChangedCart();
    expect(component.confirmation).toBe('tracking');
    expect(api.cancel).not.toHaveBeenCalled();
    expect(cart.clearCart).not.toHaveBeenCalled();
    expect(api.review).not.toHaveBeenCalled();
  });

  it('reconciles a successful payment racing cancellation without replacing it', async () => {
    component.summary = {...summary};
    cart.cartItems[0].quantity = 1;
    api.resume.and.returnValues(of({...summary}), of({...summary, status: 'PAID'}));
    api.cancel.and.returnValue(throwError(() => ({status: 409, error: {message: 'Already paid'}})));
    await component.syncChangedCart();
    expect(component.confirmation).toBe('tracking');
    expect(component.checkoutError).toBe('');
    expect(cart.clearCart).not.toHaveBeenCalled();
    expect(api.review).not.toHaveBeenCalled();
  });

  it('keeps the old attempt recoverable when payment status cannot be checked', async () => {
    component.summary = {...summary};
    cart.cartItems[0].quantity = 1;
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.resume.and.returnValue(throwError(() => ({status: 0})));
    await component.syncChangedCart();
    expect(component.summary.checkoutToken).toBe(summary.checkoutToken);
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(summary.checkoutToken);
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.quote).toHaveBeenCalledTimes(1);
    expect(component.checkoutError).toContain('Could not update checkout');
  });

  it('silently resets a changed saved cart without rendering a choice or stale messages', fakeAsync(() => {
    cart.cartItems[0].quantity = 1;
    sessionStorage.setItem('premearPendingCheckout:guest', summary.checkoutToken);
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    api.cancel.and.returnValue(of(undefined));
    spyOn(CheckoutComponent.prototype, 'ngAfterViewInit').and.resolveTo();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(fixture.componentInstance.summary).toBeNull();
    expect(fixture.nativeElement.querySelector('form').hidden).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Your cart has changed');
    expect(fixture.nativeElement.textContent).not.toContain('Continue previous checkout');
    expect(fixture.nativeElement.textContent).not.toContain('declined');
    expect(fixture.nativeElement.textContent).not.toContain('Customer and delivery details');
    fixture.destroy();
  }));

  it('cleans up a cancellation whose response was lost when recovery confirms it closed', async () => {
    component.summary = {...summary};
    cart.cartItems[0].quantity = 1;
    api.resume.and.returnValues(of({...summary}), of({...summary, status: 'CANCELLED'}));
    api.cancel.and.returnValue(throwError(() => ({status: 0})));
    await component.syncChangedCart();
    await Promise.resolve();
    expect(component.summary).toBeNull();
    expect(component.checkoutError).toBe('');
    expect(component.paymentNotice).toBe('');
    expect(component.pricingReady).toBeTrue();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('closes an unpaid checkout when all items are removed', async () => {
    component.summary = {...summary};
    cart.cartItems = [];
    api.resume.and.returnValue(of({...summary}));
    api.cancel.and.returnValue(of(undefined));
    await component.syncChangedCart();
    await Promise.resolve();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(component.summary).toBeNull();
    expect(component.checkoutError).toContain('Your cart is empty');
  });

  it('uses re-entered guest details for a new safe snapshot instead of ignoring edits', async () => {
    component.summary = {...summary, status: 'PAYMENT_FAILED'};
    api.resume.and.callFake(token => of({...summary, checkoutToken: token, status: 'PAYMENT_FAILED'}));
    api.cancel.and.returnValue(of(undefined));
    api.review.and.callFake(request => of({...summary, checkoutToken: request.requestId}));
    const pay = spyOn(component, 'pay').and.resolveTo();
    component.firstName.setValue('Updated');
    await component.onSubmit();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(api.review.calls.mostRecent().args[0].customer.firstName).toBe('Updated');
    expect(component.summary.checkoutToken).not.toBe(summary.checkoutToken);
    expect(pay).toHaveBeenCalledTimes(1);
    // Unchanged details retry the same reviewed checkout.
    await component.onSubmit();
    expect(api.review).toHaveBeenCalledTimes(1);
    expect(api.cancel).toHaveBeenCalledTimes(1);
    expect(pay).toHaveBeenCalledTimes(2);
    component.firstName.setValue('Changed again');
    await component.onSubmit();
    expect(api.review.calls.mostRecent().args[0].customer.firstName).toBe('Changed again');
    expect(api.cancel).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).toBe(component.summary.checkoutToken);
    expect(sessionStorage.getItem('premearPendingCheckout:guest')).not.toContain('Changed again');
  });


  it('does not replace a guest checkout when its payment succeeded before new details were submitted', async () => {
    component.summary = {...summary, status: 'PAYMENT_FAILED'};
    api.resume.and.returnValue(of({...summary, status: 'PAID'}));
    await component.onSubmit();
    expect(component.confirmation).toBe('tracking');
    expect(api.cancel).not.toHaveBeenCalled();
    expect(api.review).not.toHaveBeenCalled();
  });

  it('restores signed-in customer and delivery details without restoring a card', fakeAsync(() => {
    const country = {id: 1, name: 'United States', code: 'US'};
    const state = {id: 1, name: 'California'};
    const address = {street: '9 Saved Street', city: 'Los Angeles', state: state.name, country: country.name, zipCode: '90001'};
    forms.getCountries.and.returnValue(of([country]));
    forms.getStates.and.returnValue(of([state]));
    auth.user$ = of({sub: 'alice', email: 'alice@example.com'});
    sessionStorage.setItem('premearPendingCheckout:account:alice', summary.checkoutToken);
    api.resume.and.returnValue(of({...summary, status: 'PAYMENT_FAILED'}));
    api.details.and.returnValue(of({
      customer: {firstName: 'Alice', lastName: 'Example', email: 'delivery@example.com'},
      shippingAddress: address, billingAddress: address
    }));
    api.cancel.and.returnValue(of(undefined));
    spyOn(CheckoutComponent.prototype, 'ngAfterViewInit').and.resolveTo();
    const fixture = TestBed.createComponent(CheckoutComponent);
    fixture.detectChanges();
    flushMicrotasks();
    fixture.detectChanges();
    const signedIn = fixture.componentInstance;
    expect(api.details).toHaveBeenCalledWith(summary.checkoutToken);
    expect(signedIn.firstName.value).toBe('Alice');
    expect(signedIn.email.value).toBe('delivery@example.com');
    expect(signedIn.shippingAddressStreet.value).toBe('9 Saved Street');
    expect(signedIn.shippingAddressCountry.value).toEqual(country);
    expect(signedIn.billingAddressState.value).toEqual(state);
    expect(signedIn.cardComplete).toBeFalse();
    expect(signedIn.checkoutFormGroup.get('creditCard').value).toEqual({});
    expect(fixture.nativeElement.querySelector('fieldset').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBeFalse();
    expect(signedIn.isDisabled).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Customer and delivery details for this order are saved.');
    expect(fixture.nativeElement.textContent).not.toContain('Select Edit details');
    signedIn.cardComplete = true;
    signedIn.stripe = {};
    const pay = spyOn(signedIn, 'pay').and.resolveTo();
    void signedIn.onSubmit();
    flushMicrotasks();
    expect(api.cancel).not.toHaveBeenCalled();
    expect(pay).toHaveBeenCalledTimes(1);
    // Editing an expanded field must update the actual order before payment.
    signedIn.firstName.setValue('Updated Alice');
    api.review.and.callFake(request => of({...summary, checkoutToken: request.requestId}));
    void signedIn.onSubmit();
    flushMicrotasks();
    fixture.detectChanges();
    expect(api.cancel).toHaveBeenCalledWith(summary.checkoutToken);
    expect(api.review.calls.mostRecent().args[0].customer.firstName).toBe('Updated Alice');
    expect(pay).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('fieldset').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBeFalse();
    fixture.destroy();
  }));

  it('shows structured server errors on their controls and clears only fields that are edited', async () => {
    api.review.and.returnValue(throwError(() => ({status: 400, error: {
      code: 'VALIDATION_FAILED', message: 'Please check your checkout details.',
      fieldErrors: {'customer.email': 'Enter a valid email address.', 'shippingAddress.zipCode': 'Check this zip code.'}
    }})));
    await component.onSubmit();
    expect(component.email.errors?.['server']).toBe('Enter a valid email address.');
    expect(component.shippingAddressZipcode.errors?.['server']).toBe('Check this zip code.');
    expect(component.email.touched).toBeTrue();
    expect(component.isDisabled).toBeFalse();
    expect(component.state).toBe('failed');
    expect(component.canPay).toBeTrue();
    expect(cart.clearCart).not.toHaveBeenCalled();
    component.email.setValue('still invalid');
    expect(component.email.hasError('server')).toBeFalse();
    expect(component.email.hasError('email')).toBeTrue();
    expect(component.fieldErrors['shippingAddress.zipCode']).toBe('Check this zip code.');
    component.email.setValue('updated@example.com');
    component.shippingAddressZipcode.setValue('90002');
    expect(component.checkoutError).toBe('');
    api.review.and.returnValue(of(summary));
    spyOn(component, 'pay').and.resolveTo();
    await component.onSubmit();
    expect(api.review).toHaveBeenCalledTimes(2);
  });

  it('exposes indexed cart errors without assigning them to customer controls', async () => {
    api.review.and.returnValue(throwError(() => ({status: 409, error: {
      message: 'Please check your checkout details.', fieldErrors: {'items[0]': 'This item is unavailable.'}
    }})));
    await component.onSubmit();
    expect(component.generalFieldErrors).toEqual(['Item 1: This item is unavailable.']);
    expect(component.hasCartFieldErrors).toBeTrue();
    expect(component.email.hasError('server')).toBeFalse();
    expect(cart.clearCart).not.toHaveBeenCalled();
  });

  it('derives payment controls from authentication, processing, and confirmed states', () => {
    component.summary = {...summary, status: 'REQUIRES_ACTION'};
    expect(component.state).toBe('authentication-required');
    expect(component.canPay).toBeTrue();
    component.summary = {...summary, status: 'PROCESSING'};
    expect(component.state).toBe('processing');
    expect(component.formLocked).toBeTrue();
    expect(component.canPay).toBeFalse();
    component.confirmation = 'confirmed';
    expect(component.state).toBe('confirmed');
    expect(component.canPay).toBeFalse();
  });
});