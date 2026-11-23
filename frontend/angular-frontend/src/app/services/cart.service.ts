import { Injectable, OnInit } from '@angular/core';
import { CartItem } from '../common/cart-item';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnInit {

  cartItems: CartItem[] = [];

  totalPrice: Subject<number> = new BehaviorSubject<number>(0);
  totalQuantity: Subject<number> = new BehaviorSubject<number>(0);

  storage: Storage | null = null;

  constructor() {
    let raw: string | null = null;
    try {
      // Access itself can throw when the browser blocks storage.
      this.storage = localStorage;
      raw = this.storage.getItem('cartItems');
    } catch {
      // Do not overwrite a saved cart we could not read, even if writes still work.
      this.storage = null;
    }
    try {
      const saved: unknown = JSON.parse(raw ?? 'null');
      this.cartItems = this.restoreItems(saved);
    } catch {
      this.cartItems = [];
    }
    this.computeCartTotals();
  }

  private restoreItems(saved: unknown): CartItem[] {
    if (!Array.isArray(saved)) return [];
    const restored: CartItem[] = [];
    for (const entry of saved) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const id = typeof entry.id === 'number' ? String(entry.id) : entry.id;
      if (typeof id !== 'string' || !/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
          !Number.isSafeInteger(entry.variantId) || entry.variantId <= 0 ||
          !Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 999 ||
          typeof entry.unitPrice !== 'number' || !Number.isFinite(entry.unitPrice) || entry.unitPrice < 0 ||
          !Number.isSafeInteger(Math.round(entry.unitPrice * 100) * entry.quantity)) continue;
      const existing = restored.find(item => item.id === id && item.variantId === entry.variantId);
      if (existing) {
        if (existing.quantity + entry.quantity <= 999 &&
            Number.isSafeInteger(Math.round(existing.unitPrice * 100) * (existing.quantity + entry.quantity)))
          existing.quantity += entry.quantity;
        continue;
      }
      // Availability from storage is stale; only a server quote can verify it.
      restored.push({id, variantId: entry.variantId, quantity: entry.quantity, unitPrice: entry.unitPrice,
        name: typeof entry.name === 'string' ? entry.name : 'Product',
        imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : ''});
    }
    return restored;
  }

  ngOnInit(): void {

  }

  addToCart(cartItem: CartItem) {

    // check if item is already in cart
    let alreadyExistsInCart: boolean = false;
    let existingCartItem: CartItem = undefined;

    if (this.cartItems.length > 0) {
      // find the item in the cart based on item id
      existingCartItem = this.cartItems.find(tempCartItem => tempCartItem.variantId === cartItem.variantId && tempCartItem.id === cartItem.id);

      // check if foudn the item
      alreadyExistsInCart = (existingCartItem != undefined);
    }

    if (alreadyExistsInCart) {
      // increment the quantity
      existingCartItem.quantity++;
    } else {
      // add item to cart array

      this.cartItems.push(cartItem);
    }

    // compute cart total price and quantity

    this.computeCartTotals();
  }

  computeCartTotals() {
    let totalPriceValue: number = 0;
    let totalQuantityValue: number = 0;

    for (let cartItem of this.cartItems) {
      totalPriceValue += cartItem.quantity * cartItem.unitPrice;
      totalQuantityValue += cartItem.quantity;
    }

    // publish the new values for subcribers
    this.totalPrice.next(totalPriceValue);
    this.totalQuantity.next(totalQuantityValue);

    // log cart data for debugging
    this.logCartData(totalPriceValue, totalQuantityValue);

    // persist cart data
    this.persistCartItems();
  }

  logCartData(totalPriceValue: number, totalQuantityValue: number) {
    console.log(`Cart contents: `);
    for (let cartItem of this.cartItems) {
      const subTotalPrice = cartItem.unitPrice * cartItem.quantity;
      console.log(`Item Name=${cartItem.name}, Item Unit Price=${cartItem.unitPrice}, 
                  Item Quantity=${cartItem.quantity}, Subtotal=${subTotalPrice}`);
    }

    console.log(`TotalPrice=${totalPriceValue.toFixed(2)}, TotalQuantity=${totalQuantityValue}`);
    console.log('______________')
  }

  decrementQuantity(cartItem: CartItem) {
    cartItem.quantity--;

    if (cartItem.quantity === 0) {
      this.remove(cartItem);
    } else {
      this.computeCartTotals();
    }
  }

  remove(cartItem: CartItem) {
    // get index of the item int he array
    const index = this.cartItems.findIndex(tempCartItem => tempCartItem.variantId === cartItem.variantId && tempCartItem.id === cartItem.id);

    // if exists, remove the element from the array at index
    if (index > -1) {
      this.cartItems.splice(index, 1);
      this.computeCartTotals();
    }
  }

  persistCartItems() {
    try {
      this.storage?.setItem('cartItems', JSON.stringify(this.cartItems));
    } catch {
      // The in-memory cart remains usable when storage is blocked or full.
    }

  }


  applyQuote(quote: import("../common/checkout").CartQuote) {
    const changes: {name: string; previous: number; current: number}[] = [];
    for (const item of this.cartItems) {
      const line = quote.items.find(candidate => candidate.variantId === item.variantId);
      item.available = !!line?.available;
      item.availabilityMessage = line?.message || (line ? "" : "This item could not be verified. Please remove it.");
      if (line?.unitPrice != null) {
        if (Math.round(item.unitPrice * 100) !== Math.round(line.unitPrice * 100))
          changes.push({name: line.name || item.name, previous: item.unitPrice, current: line.unitPrice});
        item.unitPrice = line.unitPrice;
        item.name = line.name || item.name;
        item.imageUrl = line.imageUrl || item.imageUrl;
      }
    }
    this.computeCartTotals();
    return changes;
  }

  clearCart() {
    this.cartItems = [];
    this.computeCartTotals();
  }
}
