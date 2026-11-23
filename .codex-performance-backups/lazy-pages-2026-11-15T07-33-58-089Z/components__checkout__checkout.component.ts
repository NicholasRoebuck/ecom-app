import { checkoutState, CheckoutState } from '../../common/checkout-state';
import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, filter, switchMap, take } from 'rxjs';
import { AuthService } from '@auth0/auth0-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormServiceService } from '../../services/form-service.service';
import { Country } from '../../common/country';
import { State } from '../../common/state';
import { FormValidators } from '../../validators/form-validators';
import { CartService } from '../../services/cart.service';
import { CheckoutService } from '../../services/checkout.service';
import { PendingCheckoutService, cartSignature } from '../../services/pending-checkout.service';
import { CheckoutRequest, CheckoutSummary, CheckoutDetails } from '../../common/checkout';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css'
})
export class CheckoutComponent implements OnInit, AfterViewInit, OnDestroy {
  checkoutFormGroup: FormGroup;
  totalPrice = 0;
  totalQuantity = 0;
  countries: Country[] = [];
  shippingAddressStates: State[] = [];
  billingAddressStates: State[] = [];
  summary: CheckoutSummary | null = null;
  isSignedIn = false;
  private reviewedDetails: string | null = null;
  private countriesReady: Promise<Country[]>;
  isDisabled = false;
  cardComplete = false;
  paymentStarted = false;
  pricingLoading = true;
  pricingReady = false;
  priceChangeNotice = '';
  paymentNotice = '';
  displayError = '';
  paymentError = '';
  checkoutError = '';
  confirmation = '';
  stripe: any;
  cardElement: any;
  private requestId: string | null = null;
  private storageKey = 'premearPendingCheckout:guest';
  restoredCheckout = false;
  legacyCheckoutAvailable = false;
  private lastCartSyncAttempt: string | null = null;
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;


  @ViewChild('checkoutForm') private formElement?: ElementRef<HTMLFormElement>;
  fieldErrors: Record<string, string> = {};
  private serverErrorSummary: string | null = null;
  private readonly validationFields = [
    'customer.firstName', 'customer.lastName', 'customer.email',
    ...['shippingAddress', 'billingAddress'].flatMap(group =>
      ['street', 'city', 'state', 'country', 'zipCode'].map(field => group + '.' + field))
  ];

  get state(): CheckoutState {
    return checkoutState({
      confirmed: !!this.confirmation, submitting: this.isDisabled, loading: this.pricingLoading,
      status: this.summary?.status, cartChanged: this.cartNeedsSync,
      recoveryPending: !!this.requestId && !this.summary,
      hasError: !!(this.checkoutError || this.cardErrorMessage || Object.keys(this.fieldErrors).length),
      pricesReady: this.pricingReady || !!this.summary
    });
  }
  get formLocked(): boolean {
    return ['submitting', 'loading', 'processing', 'confirmed', 'cart-updating', 'recovery-required'].includes(this.state);
  }
  get canPay(): boolean {
    return ['ready', 'failed', 'authentication-required'].includes(this.state) &&
      this.cardComplete && !!this.stripe && (this.pricingReady || !!this.summary);
  }
  get hasCartFieldErrors(): boolean { return Object.keys(this.fieldErrors).some(path => path === 'items' || path.startsWith('items[')); }
  get generalFieldErrors(): string[] {
    return Object.entries(this.fieldErrors).filter(([path]) => !this.validationFields.includes(path))
      .map(([path, message]) => {
        const item = /^items\[(\d+)\]/.exec(path);
        return item ? 'Item ' + (Number(item[1]) + 1) + ': ' + message : message;
      });
  }
  private watchFieldCorrections(): void {
    for (const path of this.validationFields) {
      const control = this.checkoutFormGroup.get(path);
      control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (!this.fieldErrors[path]) return;
        delete this.fieldErrors[path];
        const {server, ...other} = control.errors || {};
        control.setErrors(Object.keys(other).length ? other : null, {emitEvent: false});
        if (!Object.keys(this.fieldErrors).length && this.checkoutError === this.serverErrorSummary)
          this.checkoutError = '';
      });
    }
  }
  private clearFieldErrors(): void {
    for (const path of this.validationFields) {
      const control = this.checkoutFormGroup.get(path);
      if (control?.hasError('server')) {
        const {server, ...other} = control.errors;
        control.setErrors(Object.keys(other).length ? other : null, {emitEvent: false});
      }
    }
    this.fieldErrors = {}; this.serverErrorSummary = null;
  }
  private checkoutFailure(error: any, fallback: string): string {
    const response = error.error;
    const fields = response?.fieldErrors;
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
      this.clearFieldErrors();
      for (const [path, message] of Object.entries(fields)) {
        if (typeof message !== 'string' || !message.trim()) continue;
        this.fieldErrors[path] = message;
        if (this.validationFields.includes(path)) {
          const control = this.checkoutFormGroup.get(path);
          control.setErrors({...control.errors, server: message}); control.markAsTouched();
        }
      }
      const first = this.validationFields.find(path => !!this.fieldErrors[path]);
      if (first && this.formElement) requestAnimationFrame(() => {
        if (!this.destroyed) this.formElement?.nativeElement.querySelector<HTMLElement>((first === 'customer.email' ? '#checkout-email' : '#checkout-' + first.replace(/\./g, '-')))?.focus();
      });
      if (Object.keys(this.fieldErrors).length) {
        this.serverErrorSummary = response.message || 'Please check your checkout details.';
        return this.serverErrorSummary;
      }
    }
    return response?.message || error.message || fallback;
  }

  @ViewChild('paymentConfirmation')
  set paymentConfirmation(element: ElementRef<HTMLElement> | undefined) {
    if (!element) return;
    // Wait until Angular has revealed the confirmation and hidden the form.
    requestAnimationFrame(() => {
      if (this.destroyed || !element.nativeElement.isConnected) return;
      element.nativeElement.focus({ preventScroll: true });
      element.nativeElement.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      });
    });
  }

  constructor(private formBuilder: FormBuilder, private formService: FormServiceService,
              private cartService: CartService, private checkoutService: CheckoutService, private auth: AuthService, private pendingCheckout: PendingCheckoutService) {}

  ngOnInit(): void {
    const email = '';
    const requiredText = () => new FormControl('', [Validators.required, FormValidators.notOnlyWhitetSpace]);
    const address = () => this.formBuilder.group({
      street: requiredText(), city: requiredText(), state: new FormControl('', Validators.required),
      country: new FormControl('', Validators.required), zipCode: requiredText()
    });
    this.checkoutFormGroup = this.formBuilder.group({
      customer: this.formBuilder.group({
        firstName: requiredText(), lastName: requiredText(),
        email: new FormControl(email, [Validators.required, Validators.email])
      }),
      shippingAddress: address(), billingAddress: address(), creditCard: this.formBuilder.group({})
    });
    this.watchFieldCorrections();
    this.cartService.totalQuantity.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => { this.totalQuantity = value; this.queueCartSync(); });
    this.cartService.totalPrice.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => this.totalPrice = value);
    this.countriesReady = firstValueFrom(this.formService.getCountries().pipe(takeUntilDestroyed(this.destroyRef)))
      .then(countries => this.countries = countries)
      .catch(() => { this.checkoutError = 'Could not load countries. Please reload checkout.'; return []; });

    // Recovery slots are separate for each account and guest checkout.
    this.auth.isLoading$.pipe(filter(loading => !loading), take(1),
      switchMap(() => this.auth.user$.pipe(take(1))), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: user => {
        this.isSignedIn = !!user?.sub;
        this.storageKey = 'premearPendingCheckout:' + (user?.sub ? 'account:' + user.sub : 'guest');
        if (user?.email && !this.email.dirty) this.email.setValue(user.email);
        const token = sessionStorage.getItem(this.storageKey);
        if (token) this.recoverCheckout(token);
        else {
          this.legacyCheckoutAvailable = !!sessionStorage.getItem('premearPendingCheckout');
          void this.refreshPricing();
        }
      },
      error: () => { this.pricingLoading = false; this.checkoutError = 'Could not determine your sign-in state. Reload checkout.'; }
    });
  }

  recoverPreviousCheckout(): void {
    if (this.isDisabled || this.requestId || this.summary) return;
    const token = sessionStorage.getItem('premearPendingCheckout');
    if (token) this.recoverCheckout(token);
  }

  private recoverCheckout(token: string): void {
    this.requestId = token;
    this.isDisabled = true;
    this.checkoutError = '';
    this.checkoutService.resume(token).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: summary => {
        sessionStorage.setItem(this.storageKey, token);
        if (sessionStorage.getItem('premearPendingCheckout') === token) sessionStorage.removeItem('premearPendingCheckout');
        this.legacyCheckoutAvailable = false;
        this.restoredCheckout = true;
        this.pricingLoading = false;
        this.pricingReady = true;
        this.isDisabled = false;
        this.applyPaymentSummary(summary);
        if (this.isSignedIn && this.summary && !this.confirmation && !this.cartNeedsSync) void this.restoreAccountDetails(token);
      },
      error: (error: any) => {
        this.pricingLoading = false;
        this.isDisabled = false;
        if ([401, 403].includes(error.status) && sessionStorage.getItem('premearPendingCheckout') === token) this.requestId = null;
        if (error.status === 404) {
          if (sessionStorage.getItem('premearPendingCheckout') === token) sessionStorage.removeItem('premearPendingCheckout');
          this.legacyCheckoutAvailable = false;
          this.clearPending();
          void this.refreshPricing();
          return;
        }
        this.checkoutError = error.status === 401 || error.status === 403
          ? 'Sign in with the account that started this checkout to recover it.'
          : 'Could not recover your pending checkout. Reload to retry before starting another purchase.';
      }
    });
  }

  private async restoreAccountDetails(token: string): Promise<void> {
    this.isDisabled = true;
    try {
      const [details, countries] = await Promise.all([
        firstValueFrom(this.checkoutService.details(token)), this.countriesReady
      ]);
      const restoreAddress = async (address: CheckoutDetails['shippingAddress']) => {
        const country = countries.find(item => item.name === address.country || item.code === address.country);
        if (!country) throw new Error('Saved country is unavailable.');
        const states = await firstValueFrom(this.formService.getStates(country.code));
        const state = states.find(item => item.name === address.state);
        if (!state) throw new Error('Saved state is unavailable.');
        return {value: {...address, country, state}, states};
      };
      const [shipping, billing] = await Promise.all([
        restoreAddress(details.shippingAddress), restoreAddress(details.billingAddress)
      ]);
      if (this.destroyed || this.summary?.checkoutToken !== token) return;
      this.shippingAddressStates = shipping.states;
      this.billingAddressStates = billing.states;
      this.checkoutFormGroup.patchValue({customer: details.customer,
        shippingAddress: shipping.value, billingAddress: billing.value});
      this.checkoutFormGroup.markAsPristine();
      this.reviewedDetails = this.detailsSignature();
    } catch {
      if (!this.destroyed && this.summary?.checkoutToken === token)
        this.checkoutError = 'Saved details could not be restored. Enter your customer and delivery details before paying.';
    } finally { if (!this.destroyed) { this.isDisabled = false; this.queueCartSync(); } }
  }

  private detailsSignature(): string {
    const value = this.checkoutFormGroup.getRawValue();
    return JSON.stringify({customer: value.customer, shippingAddress: value.shippingAddress, billingAddress: value.billingAddress});
  }

  private applyPaymentSummary(summary: CheckoutSummary): void {
    this.queueCartSync();
    this.summary = summary;
    this.paymentStarted = true;
    this.showPaymentStatus(summary.status);
    if (summary.status === 'PAID') this.finish(summary.orderTrackingNumber);
    else if (['CANCELLED', 'EXPIRED'].includes(summary.status)) {
      this.resetSavedCheckout();
      void this.refreshPricing();
    }
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      // The page loads Stripe asynchronously; wait for it instead of racing the global.
      for (let attempt = 0; typeof Stripe === 'undefined' && attempt < 100; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (this.destroyed) return;
      }
      if (this.destroyed) return;
      if (typeof Stripe === 'undefined' || !environment['stripePublishableKey']) throw new Error();
      this.stripe = Stripe(environment['stripePublishableKey']);
      this.cardElement = this.stripe.elements().create('card', { hidePostalCode: false });
      this.cardElement.mount('#card-element');
      this.cardElement.on('change', (event: any) => this.onCardChange(event));
    } catch {
      this.checkoutError = 'The payment form could not load. Please reload checkout.';
    }
  }


  onCardChange(event: {complete: boolean; empty: boolean; error?: {message?: string}}): void {
    this.cardComplete = event.complete;
    this.displayError = event.error?.message || '';
    // Ignore Stripe's initial empty event; dismiss the prior decline once the card is edited.
    if (!event.empty) {
      this.paymentError = '';
      if (this.summary?.status === 'PAYMENT_FAILED') this.paymentNotice = '';
    }
  }

  ngOnDestroy(): void { this.destroyed = true; this.cardElement?.destroy(); }

  get firstName() { return this.checkoutFormGroup.get('customer.firstName'); }
  get lastName() { return this.checkoutFormGroup.get('customer.lastName'); }
  get email() { return this.checkoutFormGroup.get('customer.email'); }
  get shippingAddressStreet() { return this.checkoutFormGroup.get('shippingAddress.street'); }
  get shippingAddressCity() { return this.checkoutFormGroup.get('shippingAddress.city'); }
  get shippingAddressState() { return this.checkoutFormGroup.get('shippingAddress.state'); }
  get shippingAddressCountry() { return this.checkoutFormGroup.get('shippingAddress.country'); }
  get shippingAddressZipcode() { return this.checkoutFormGroup.get('shippingAddress.zipCode'); }
  get billingAddressStreet() { return this.checkoutFormGroup.get('billingAddress.street'); }
  get billingAddressCity() { return this.checkoutFormGroup.get('billingAddress.city'); }
  get billingAddressState() { return this.checkoutFormGroup.get('billingAddress.state'); }
  get billingAddressCountry() { return this.checkoutFormGroup.get('billingAddress.country'); }
  get billingAddressZipcode() { return this.checkoutFormGroup.get('billingAddress.zipCode'); }

  copyShippingAddressToBillingAddress(event: Event): void {
    if ((event.target as HTMLInputElement).checked) {
      this.billingAddressStates = [...this.shippingAddressStates];
      this.checkoutFormGroup.get('billingAddress').setValue(this.checkoutFormGroup.get('shippingAddress').value);
    } else {
      this.checkoutFormGroup.get('billingAddress').reset();
      this.billingAddressStates = [];
    }
  }

  getStates(groupName: string): void {
    const group = this.checkoutFormGroup.get(groupName);
    group.get('state').reset();
    this.formService.getStates(group.value.country.code).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (groupName === 'shippingAddress') this.shippingAddressStates = data;
        else this.billingAddressStates = data;
      },
      error: () => this.checkoutError = 'Could not load states. Please select the country again.'
    });
  }

  get cartItems() { return this.cartService.cartItems; }

  private cartSignature(items: {variantId: number; quantity: number}[]): string {
    return cartSignature(items);
  }

  get cartNeedsSync(): boolean {
    return !!this.summary && !this.confirmation &&
      !['PAID', 'CANCELLED', 'EXPIRED'].includes(this.summary.status) &&
      this.cartSignature(this.cartItems) !== this.cartSignature(this.summary.items);
  }

  private queueCartSync(): void {
    queueMicrotask(() => {
      if (this.destroyed || this.isDisabled || !this.cartNeedsSync) return;
      const attempt = this.summary.checkoutToken + ':' + this.cartSignature(this.cartItems);
      if (attempt !== this.lastCartSyncAttempt) void this.syncChangedCart();
    });
  }

  async syncChangedCart(): Promise<void> {
    if (this.isDisabled || !this.summary || !this.cartNeedsSync) return;
    const token = this.summary.checkoutToken;
    this.lastCartSyncAttempt = token + ':' + this.cartSignature(this.cartItems);
    this.isDisabled = true;
    this.checkoutError = '';
    try {
      const latest = await this.pendingCheckout.reconcile(token);
      this.applyPaymentSummary(latest);
    } catch (error: any) {
      this.checkoutError = error.error?.message ||
        'Could not update checkout for your cart. Refresh the page to recover checkout before trying again.';
    } finally { this.isDisabled = false; this.queueCartSync(); }
  }

  private resetSavedCheckout(clearCard = true): void {
    this.clearFieldErrors();
    this.reviewedDetails = null;
    this.summary = null;
    this.paymentStarted = false;
    this.restoredCheckout = false;
    this.lastCartSyncAttempt = null;
    this.paymentNotice = '';
    this.paymentError = '';
    this.checkoutError = '';
    this.displayError = '';
    this.priceChangeNotice = '';
    if (clearCard) { this.cardElement?.clear(); this.cardComplete = false; }
    this.clearPending();
  }

  get canEditDetails(): boolean {
    return !!this.summary && ['PENDING', 'PAYMENT_FAILED', 'REQUIRES_ACTION'].includes(this.summary.status);
  }

  async refreshPricing(): Promise<void> {
    this.pricingLoading = true;
    this.pricingReady = false;
    this.priceChangeNotice = '';
    this.checkoutError = '';
    try {
      const items = this.cartService.cartItems;
      if (!items.length) throw new Error('Your cart is empty. Add items before checking out.');
      if (items.some(item => !Number.isSafeInteger(item.variantId) || item.variantId <= 0))
        throw new Error('Remove older items and add them again before checkout.');
      const quote = await firstValueFrom(this.checkoutService.quote(items.map(item => ({variantId: item.variantId, quantity: item.quantity}))));
      const changes = this.cartService.applyQuote(quote);
      if (changes.length) this.priceChangeNotice = 'Prices have changed since your last visit. Your order total has been updated.';
      this.pricingReady = quote.available;
      if (!quote.available) this.checkoutError = 'Some items are unavailable. Return to your cart to update quantities or remove them.';
    } catch (error: any) {
      this.checkoutError = this.checkoutFailure(error, 'Could not check current prices. Please try again.');
    } finally { this.pricingLoading = false; }
  }

  async onSubmit(): Promise<void> {
    if (this.isDisabled || this.pricingLoading || this.confirmation || this.summary?.status === 'PROCESSING') return;
    if (this.cartNeedsSync) { await this.syncChangedCart(); return; }
    this.checkoutError = '';
    let previousItems: CheckoutSummary['items'] | null = null;
    if (this.summary) {
      if (this.reviewedDetails === this.detailsSignature() && this.checkoutFormGroup.valid) {
        await this.pay(); return;
      }
      if (this.checkoutFormGroup.invalid) { this.checkoutFormGroup.markAllAsTouched(); return; }
      if (!this.cardComplete || !this.stripe) { this.checkoutError = 'Please complete your card details.'; return; }
      previousItems = this.summary.items;
      const token = this.summary.checkoutToken;
      this.isDisabled = true;
      try {
        const latest = await firstValueFrom(this.checkoutService.resume(token));
        this.applyPaymentSummary(latest);
        if (this.confirmation || latest.status === 'PROCESSING' || !this.summary) return;
        await firstValueFrom(this.checkoutService.cancel(token));
        this.resetSavedCheckout(false);
      } catch (error: any) {
        try { this.applyPaymentSummary(await firstValueFrom(this.checkoutService.resume(token))); } catch {}
        if (!this.confirmation) this.checkoutError = error.error?.message ||
          'Could not safely update checkout details. Refresh the page to recover checkout before retrying.';
        return;
      } finally { this.isDisabled = false; }
    }
    // A failed recovery must not silently create a second checkout.
    if (this.requestId) { this.checkoutError = 'Reload to recover the pending checkout before continuing.'; return; }
    if (!this.pricingReady) { this.checkoutError = 'Current prices could not be verified. Return to your cart or retry the price check.'; return; }
    if (this.checkoutFormGroup.invalid) { this.checkoutFormGroup.markAllAsTouched(); return; }
    const items = previousItems || this.cartService.cartItems;
    if (!items.length || items.some(item => !Number.isSafeInteger(item.variantId) || item.variantId <= 0)) {
      this.checkoutError = 'Your cart needs updating. Remove older items and add them again before checkout.';
      return;
    }
    if (!this.cardComplete || !this.stripe) { this.checkoutError = 'Please complete your card details.'; return; }
    const expectedTotal = Math.round((previousItems ? previousItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) : this.totalPrice) * 100);
    const expectedPrices = new Map<number, number>(items.map(item => [item.variantId, Math.round(item.unitPrice * 100)] as const));
    this.isDisabled = true;
    const token = crypto.randomUUID();
    this.requestId = token;
    sessionStorage.setItem(this.storageKey, token);
    this.legacyCheckoutAvailable = false;
    const value = this.checkoutFormGroup.getRawValue();
    const address = (input: any) => ({ ...input, state: input.state.name, country: input.country.name });
    const request: CheckoutRequest = {
      requestId: token,
      items: items.map(item => ({ variantId: item.variantId, quantity: item.quantity })),
      customer: value.customer,
      shippingAddress: address(value.shippingAddress), billingAddress: address(value.billingAddress)
    };
    const submittedDetails = this.detailsSignature();
    try {
      this.summary = await firstValueFrom(this.checkoutService.review(request));
      this.reviewedDetails = submittedDetails;
      const changed = Math.round(this.summary.totalPrice * 100) !== expectedTotal ||
        this.summary.items.some(item => expectedPrices.get(item.variantId) !== Math.round(item.unitPrice * 100));
      if (changed) {
        this.priceChangeNotice = 'Prices changed while you were checking out. Please confirm the updated total below before paying.';
        // Do not create a payment intent or charge until the customer accepts this amount.
        return;
      }
      this.priceChangeNotice = '';
      await this.pay();
    } catch (error: any) {
      // A definite client error did not save an order. An uncertain network/server failure keeps the token for recovery.
      if (error.status >= 400 && error.status < 500 && error.status !== 409) {
        this.clearPending();
      } else if (error.status === 409) {
        // A conflicting review may be an idempotent concurrent request; recover before releasing its token.
        try { this.applyPaymentSummary(await firstValueFrom(this.checkoutService.resume(token))); }
        catch (resumeError: any) { if (resumeError.status === 404) this.clearPending(); }
      }
      this.checkoutError = this.checkoutFailure(error, 'Could not review checkout. Reload to recover before retrying.');
    } finally { this.isDisabled = false; }
  }

  async pay(): Promise<void> {
    if (!this.summary || this.confirmation || this.cartNeedsSync || this.summary.status === 'PROCESSING') return;
    this.paymentNotice = '';
    this.paymentError = '';
    this.checkoutError = '';
    if (!this.cardComplete || !this.stripe) {
      this.checkoutError = 'Please complete your card details.'; return;
    }
    this.isDisabled = true;
    this.paymentStarted = true;
    try {
      const payment = await firstValueFrom(this.checkoutService.createPaymentIntent(this.summary.checkoutToken));
      // Reusing the same intent also handles a prior successful payment whose confirmation response was lost.
      const current = await this.stripe.retrievePaymentIntent(payment.clientSecret);
      if (current.error) throw current.error;
      if (['processing', 'requires_capture'].includes(current.paymentIntent.status)) {
        this.summary.status = 'PROCESSING';
        this.showPaymentStatus('PROCESSING');
        return;
      }
      if (current.paymentIntent.status !== 'succeeded') {
        const value = this.checkoutFormGroup.getRawValue();
        const billingDetails = this.checkoutFormGroup.valid ? {
          email: value.customer.email,
          name: value.customer.firstName + ' ' + value.customer.lastName,
          address: {
            line1: value.billingAddress.street, city: value.billingAddress.city,
            state: value.billingAddress.state.name, postal_code: value.billingAddress.zipCode,
            country: value.billingAddress.country.code
          }
        } : undefined;
        const result = await this.stripe.confirmCardPayment(payment.clientSecret, {
          payment_method: { card: this.cardElement, ...(billingDetails ? { billing_details: billingDetails } : {}) }
        });
        if (result.error) throw result.error;
        if (result.paymentIntent?.status !== 'succeeded') {
          const status = result.paymentIntent?.status;
          this.summary.status = status === 'requires_action' ? 'REQUIRES_ACTION'
            : status === 'requires_payment_method' ? 'PAYMENT_FAILED'
            : status === 'requires_confirmation' ? 'PENDING' : 'PROCESSING';
          this.showPaymentStatus(this.summary.status);
          return;
        }
      }
      await this.confirmPayment();
    } catch (error: any) {
      const message = error.error?.message || error.message || 'Payment could not be completed. Refresh the page to recover checkout before retrying.';
      try {
        this.applyPaymentSummary(await firstValueFrom(this.checkoutService.resume(this.summary.checkoutToken)));
      } catch { /* Keep the recovery token if the payment status is unavailable. */ }
      if (!this.confirmation) {
        if (error.type === 'card_error' || error.code === 'card_declined' || this.summary?.status === 'PAYMENT_FAILED') {
          this.paymentError = message;
        } else this.checkoutError = message;
      }
    } finally { this.isDisabled = false; }
  }

  async checkPayment(): Promise<void> {
    if (!this.summary || this.isDisabled) return;
    this.isDisabled = true;
    this.checkoutError = '';
    try {
      this.applyPaymentSummary(await firstValueFrom(this.checkoutService.resume(this.summary.checkoutToken)));
      this.lastCartSyncAttempt = null;
    }
    catch (error: any) {
      this.checkoutError = error.error?.message || 'Could not verify payment. Retry checking before starting another purchase.';
    } finally { this.isDisabled = false; }
  }

  get cardErrorMessage(): string {
    return this.displayError || this.paymentError ||
      (this.summary?.status === 'PAYMENT_FAILED' ? this.paymentNotice : '');
  }

  private showPaymentStatus(status: string): void {
    if (status !== 'PAYMENT_FAILED') this.paymentError = '';
    this.paymentNotice = ({
      PROCESSING: 'Your payment is processing. Refresh the page for an update before attempting another payment.',
      PAYMENT_FAILED: 'Your previous payment was declined. Correct your card details or use another card to retry.',
      REQUIRES_ACTION: 'Your bank requires authentication. Complete your card details and select Pay to continue.',
      PENDING: 'Payment has not completed. You can correct your card details and retry.'
    } as Record<string, string>)[status] || '';
  }

  private async confirmPayment(): Promise<void> {
    const result = await firstValueFrom(this.checkoutService.placeOrder(this.summary.checkoutToken));
    this.finish(result.orderTrackingNumber);
  }

  private finish(tracking: string): void {
    this.clearFieldErrors();
    this.confirmation = tracking;
    this.paymentNotice = '';
    this.paymentError = '';
    this.checkoutError = '';
    this.priceChangeNotice = '';
    // Recovering an older successful order must not erase a different current cart.
    const purchased = this.summary?.items || [];
    const current = this.cartService.cartItems;
    if (current.length === purchased.length && current.every(item =>
      purchased.some(line => line.variantId === item.variantId && line.quantity === item.quantity))) {
      this.cartService.clearCart();
    }
    this.clearPending();
  }

  private clearPending(): void {
    sessionStorage.removeItem(this.storageKey);
    this.requestId = null;
  }

  async editDetails(): Promise<void> {
    if (this.isDisabled || !this.canEditDetails) return;
    this.isDisabled = true;
    try {
      await firstValueFrom(this.checkoutService.cancel(this.summary.checkoutToken));
      this.resetSavedCheckout();
      await this.refreshPricing();
    } catch (error: any) {
      this.checkoutError = error.error?.message || 'Could not cancel checkout. Refresh the page to recover checkout before continuing.';
    } finally { this.isDisabled = false; }
  }
}
