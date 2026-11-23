import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { Observable, filter, switchMap, take } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthInterceptorService implements HttpInterceptor {
  constructor(private auth: AuthService, @Inject(DOCUMENT) private document: Document) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const api = new URL(environment['premearAppApiUrl'] || '/', this.document.baseURI);
    const target = new URL(request.url, this.document.baseURI);
    const basePath = api.pathname.replace(/\/$/, '');
    if (target.origin !== api.origin) return next.handle(request);

    const admin = basePath + '/admin';
    if (target.pathname === admin || target.pathname.startsWith(admin + '/')) return this.withToken(request, next);

    const accountOrders = basePath + '/me/orders';
    if (target.pathname === accountOrders || target.pathname.startsWith(accountOrders + '/')) {
      return this.withToken(request, next);
    }
    if (request.method === 'POST' && ['/review', '/resume', '/cancel', '/payment-intent', '/purchase', '/details'].some(path => target.pathname === basePath + '/checkout' + path)) {
      // Wait for Auth0 initialization. A token failure for a signed-in user must not silently become a guest order.
      return this.auth.isLoading$.pipe(filter(loading => !loading), take(1),
        switchMap(() => this.auth.isAuthenticated$.pipe(take(1))),
        switchMap(authenticated => authenticated ? this.withToken(request, next) : next.handle(request)));
    }
    return next.handle(request);
  }

  private withToken(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    return this.auth.getAccessTokenSilently().pipe(take(1),
      switchMap(token => next.handle(request.clone({setHeaders: {Authorization: 'Bearer ' + token}}))));
  }
}
