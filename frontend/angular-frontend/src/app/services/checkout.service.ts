import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { CartQuote, CheckoutRequest, CheckoutSummary, CheckoutDetails } from '../common/checkout';

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private baseUrl = environment['premearAppApiUrl'] + '/checkout';
  constructor(private http: HttpClient) {}

  quote(items: {variantId: number; quantity: number}[]) {
    return this.http.post<CartQuote>(this.baseUrl + '/quote', { items });
  }
  review(request: CheckoutRequest) {
    return this.http.post<CheckoutSummary>(this.baseUrl + '/review', request);
  }
  details(checkoutToken: string) {
    return this.http.post<CheckoutDetails>(this.baseUrl + '/details', {checkoutToken});
  }
  cancel(checkoutToken: string) {
    return this.http.post<void>(this.baseUrl + '/cancel', { checkoutToken });
  }
  resume(checkoutToken: string) {
    return this.http.post<CheckoutSummary>(this.baseUrl + '/resume', { checkoutToken });
  }
  createPaymentIntent(checkoutToken: string) {
    return this.http.post<{clientSecret: string}>(this.baseUrl + '/payment-intent', { checkoutToken });
  }
  placeOrder(checkoutToken: string) {
    return this.http.post<{orderTrackingNumber: string}>(this.baseUrl + '/purchase', { checkoutToken });
  }
}
