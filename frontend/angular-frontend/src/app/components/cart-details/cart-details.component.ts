import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CartItem } from '../../common/cart-item';
import { CartService } from '../../services/cart.service';
import { CheckoutService } from '../../services/checkout.service';
import { PendingCheckoutService } from '../../services/pending-checkout.service';

@Component({
  selector: 'app-cart-details',
  templateUrl: './cart-details.component.html',
  styleUrl: './cart-details.component.css'
})
export class CartDetailsComponent implements OnInit {
  cartItems: CartItem[] = [];
  totalPrice = 0;
  totalQuantity = 0;
  refreshing = false;
  pricingReady = false;
  error = '';
  changes: {name: string; previous: number; current: number}[] = [];
  private destroyRef = inject(DestroyRef);

  constructor(private cartService: CartService, private checkout: CheckoutService, public pendingCheckout: PendingCheckoutService) {}

  ngOnInit(): void {
    this.cartItems = this.cartService.cartItems;
    this.cartService.totalPrice.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => this.totalPrice = value);
    this.cartService.totalQuantity.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(value => this.totalQuantity = value);
    this.refreshPrices();
  }

  refreshPrices(): void {
    this.error = '';
    this.pricingReady = false;
    this.cartItems = this.cartService.cartItems;
    if (!this.cartItems.length) { this.refreshing = false; return; }
    if (this.cartItems.some(item => !Number.isSafeInteger(item.variantId) || item.variantId <= 0)) {
      this.error = 'Remove older cart items and add them again so their current prices can be checked.';
      return;
    }
    this.refreshing = true;
    this.checkout.quote(this.cartItems.map(item => ({variantId: item.variantId, quantity: item.quantity})))
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: quote => {
          const changes = this.cartService.applyQuote(quote);
          // Keep a notice visible after a quantity refresh when there is no new price change.
          if (changes.length) this.changes = changes;
          this.pricingReady = quote.available;
          this.refreshing = false;
        },
        error: error => {
          this.error = error.error?.message || 'Could not check current prices. Please try again before checkout.';
          this.refreshing = false;
        }
      });
  }

  incrementQuantity(item: CartItem): void {
    if (this.refreshing) return;
    this.cartService.addToCart(item);
    this.refreshPrices();
  }
  decrementQuantity(item: CartItem): void {
    if (this.refreshing) return;
    this.cartService.decrementQuantity(item);
    this.refreshPrices();
  }
  remove(item: CartItem): void {
    if (this.refreshing) return;
    this.cartService.remove(item);
    this.changes = this.changes.filter(change => change.name !== item.name);
    this.refreshPrices();
  }
}
