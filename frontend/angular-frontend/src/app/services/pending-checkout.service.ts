import { DestroyRef, Injectable, inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { combineLatest, concatMap, distinctUntilChanged, filter, firstValueFrom, map, tap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CartService } from './cart.service';
import { CheckoutService } from './checkout.service';
import { CheckoutSummary } from '../common/checkout';

export function cartSignature(items: {variantId: number; quantity: number}[]): string {
  const quantities = new Map<number, number>();
  for (const item of items) quantities.set(item.variantId, (quantities.get(item.variantId) || 0) + item.quantity);
  return JSON.stringify([...quantities].sort((left, right) => left[0] - right[0]));
}

@Injectable({providedIn: 'root'})
export class PendingCheckoutService {
  private readonly destroyRef = inject(DestroyRef);
  private started = false;
  private currentKey = '';
  private readonly inFlight = new Map<string, Promise<CheckoutSummary>>();

  constructor(private auth: AuthService, private cart: CartService, private api: CheckoutService) {}

  get hasPendingCheckout(): boolean {
    return !!this.currentKey && !!sessionStorage.getItem(this.currentKey);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    combineLatest([this.auth.isLoading$, this.auth.user$, this.cart.totalQuantity]).pipe(
      filter(([loading]) => !loading),
      map(([, user]) => ({
        key: 'premearPendingCheckout:' + (user?.sub ? 'account:' + user.sub : 'guest'),
        signature: cartSignature(this.cart.cartItems)
      })),
      tap(context => this.currentKey = context.key),
      distinctUntilChanged((left, right) => left.key === right.key && left.signature === right.signature),
      concatMap(async context => {
        if (context.key !== this.currentKey) return;
        const token = sessionStorage.getItem(context.key);
        if (!token) return;
        try {
          const result = await this.reconcile(token, () => context.key === this.currentKey);
          if (['CANCELLED', 'EXPIRED'].includes(result.status) && sessionStorage.getItem(context.key) === token)
            sessionStorage.removeItem(context.key);
        } catch {
          // Keep the token on uncertainty. Checkout can recover and display the actual payment state.
        }
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe();
  }

  reconcile(token: string, stillCurrent: () => boolean = () => true): Promise<CheckoutSummary> {
    const existing = this.inFlight.get(token);
    if (existing) return existing;
    const pending = this.reconcileOnce(token, stillCurrent).finally(() => this.inFlight.delete(token));
    this.inFlight.set(token, pending);
    return pending;
  }

  private async reconcileOnce(token: string, stillCurrent: () => boolean): Promise<CheckoutSummary> {
    const saved = await firstValueFrom(this.api.resume(token));
    if (!stillCurrent() || !['PENDING', 'PAYMENT_FAILED', 'REQUIRES_ACTION'].includes(saved.status) ||
        cartSignature(saved.items) === cartSignature(this.cart.cartItems)) return saved;
    try {
      await firstValueFrom(this.api.cancel(token));
      return {...saved, status: 'CANCELLED'};
    } catch (error) {
      const recovered = await firstValueFrom(this.api.resume(token));
      if (['PAID', 'PROCESSING', 'CANCELLED', 'EXPIRED'].includes(recovered.status)) return recovered;
      throw error;
    }
  }
}
