import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CheckoutService } from './checkout.service';
import { environment } from '../../environments/environment';

describe('CheckoutService server-owned pricing contract', () => {
  let service: CheckoutService;
  let http: HttpTestingController;
  const base = environment['premearAppApiUrl'] + '/checkout';
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(CheckoutService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('submits only a checkout token when starting or confirming payment', () => {
    service.createPaymentIntent('token').subscribe();
    const payment = http.expectOne(base + '/payment-intent');
    expect(payment.request.body).toEqual({ checkoutToken: 'token' });
    payment.flush({ clientSecret: 'secret' });
    service.placeOrder('token').subscribe();
    const purchase = http.expectOne(base + '/purchase');
    expect(purchase.request.body).toEqual({ checkoutToken: 'token' });
    purchase.flush({ orderTrackingNumber: 'tracking' });
  });

  it('uses the same token for recovery and cancellation', () => {
    service.resume('token').subscribe();
    const resume = http.expectOne(base + '/resume');
    expect(resume.request.body).toEqual({ checkoutToken: 'token' });
    resume.flush({});
    service.cancel('token').subscribe();
    const cancel = http.expectOne(base + '/cancel');
    expect(cancel.request.body).toEqual({ checkoutToken: 'token' });
    cancel.flush(null);
  });
  it('checks cart prices using item IDs and quantities without customer details', () => {
    service.quote([{variantId: 42, quantity: 2}]).subscribe();
    const quote = http.expectOne(base + '/quote');
    expect(quote.request.body).toEqual({items: [{variantId: 42, quantity: 2}]});
    quote.flush({currency: 'usd', totalPrice: 20, totalQuantity: 2, available: true, items: []});
  });

  it('requests saved account details by token without sending customer information', () => {
    service.details('token').subscribe();
    const details = http.expectOne(base + '/details');
    expect(details.request.body).toEqual({checkoutToken: 'token'});
    details.flush({customer: {}, shippingAddress: {}, billingAddress: {}});
  });
});