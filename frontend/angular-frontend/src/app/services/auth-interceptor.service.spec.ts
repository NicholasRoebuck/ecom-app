import { of, throwError, BehaviorSubject } from 'rxjs';
import { HttpHandler, HttpRequest, HttpResponse } from '@angular/common/http';
import { AuthInterceptorService } from './auth-interceptor.service';
import { environment } from '../../environments/environment';

describe('AuthInterceptorService account ownership', () => {
  let auth: any;
  let handler: jasmine.SpyObj<HttpHandler>;
  let interceptor: AuthInterceptorService;
  const api = environment['premearAppApiUrl'];

  beforeEach(() => {
    auth = {
      isLoading$: of(false), isAuthenticated$: of(true),
      getAccessTokenSilently: jasmine.createSpy('getAccessTokenSilently').and.returnValue(of('access-token'))
    };
    handler = jasmine.createSpyObj('HttpHandler', ['handle']);
    handler.handle.and.returnValue(of(new HttpResponse({status: 200})));
    interceptor = new AuthInterceptorService(auth, document);
  });

  it('attaches the access token to account orders and their detail resources', () => {
    for (const path of ['/me/orders', '/me/orders/123/items']) {
      interceptor.intercept(new HttpRequest('GET', api + path), handler).subscribe();
      expect(handler.handle.calls.mostRecent().args[0].headers.get('Authorization')).toBe('Bearer access-token');
    }
  });

  it('attaches the verified user token to signed-in checkout creation', () => {
    interceptor.intercept(new HttpRequest('POST', api + '/checkout/review', {}), handler).subscribe();
    expect(handler.handle.calls.mostRecent().args[0].headers.get('Authorization')).toBe('Bearer access-token');
  });

  it('keeps anonymous checkout available without fetching a token', () => {
    auth.isAuthenticated$ = of(false);
    interceptor.intercept(new HttpRequest('POST', api + '/checkout/review', {}), handler).subscribe();
    expect(auth.getAccessTokenSilently).not.toHaveBeenCalled();
    expect(handler.handle.calls.mostRecent().args[0].headers.has('Authorization')).toBeFalse();
  });

  it('waits for Auth0 initialization rather than treating a signed-in customer as a guest', () => {
    const loading = new BehaviorSubject(true); auth.isLoading$ = loading;
    interceptor.intercept(new HttpRequest('POST', api + '/checkout/review', {}), handler).subscribe();
    expect(handler.handle).not.toHaveBeenCalled();
    loading.next(false);
    expect(handler.handle.calls.mostRecent().args[0].headers.get('Authorization')).toBe('Bearer access-token');
  });

  it('never silently falls back to a guest order after token retrieval fails', () => {
    auth.getAccessTokenSilently.and.returnValue(throwError(() => new Error('token unavailable')));
    let failed = false;
    interceptor.intercept(new HttpRequest('POST', api + '/checkout/review', {}), handler)
      .subscribe({error: () => failed = true});
    expect(failed).toBeTrue();
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('does not send credentials to another origin or a lookalike path', () => {
    for (const url of [
      'https://untrusted.example/api/me/orders?next=' + encodeURIComponent(api + '/me/orders'),
      api + '/me/orders-other', api + '/products', api + '/orders'
    ]) {
      interceptor.intercept(new HttpRequest('GET', url), handler).subscribe();
      expect(handler.handle.calls.mostRecent().args[0].headers.has('Authorization')).toBeFalse();
    }
    expect(auth.getAccessTokenSilently).not.toHaveBeenCalled();
  });

  it('attaches account identity to every payment recovery operation', () => {
    for (const path of ['/resume', '/cancel', '/payment-intent', '/purchase', '/details']) {
      interceptor.intercept(new HttpRequest('POST', api + '/checkout' + path, {}), handler).subscribe();
      expect(handler.handle.calls.mostRecent().args[0].headers.get('Authorization')).toBe('Bearer access-token');
    }
  });

  it('attaches tokens only to the configured admin origin and path boundary', () => {
    for (const path of ['/admin', '/admin/access', '/admin/products/1']) {
      interceptor.intercept(new HttpRequest('GET', api + path), handler).subscribe();
      expect(handler.handle.calls.mostRecent().args[0].headers.get('Authorization')).toBe('Bearer access-token');
    }
    for (const url of [api + '/admin-other', 'https://untrusted.example/api/admin/access']) {
      interceptor.intercept(new HttpRequest('GET', url), handler).subscribe();
      expect(handler.handle.calls.mostRecent().args[0].headers.has('Authorization')).toBeFalse();
    }
  });
});
