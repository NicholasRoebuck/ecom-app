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


  constructor() { }

  ngOnInit(): void {
    
  }

  addToCart(cartItem: CartItem) {
    
    // check if item is already in cart
    let alreadyExistsInCart: boolean = false;
    let existingCartItem: CartItem = undefined;

    if(this.cartItems.length > 0){
      // find the item in the cart based on item id
      existingCartItem = this.cartItems.find(tempCartItem => tempCartItem.id === cartItem.id);
      
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

    for (let cartItem of this.cartItems){
      totalPriceValue += cartItem.quantity * cartItem.unitPrice;
      totalQuantityValue += cartItem.quantity;
    }

    // publish the new values for subcribers
    this.totalPrice.next(totalPriceValue);
    this.totalQuantity.next(totalQuantityValue);

    // log cart data for debugging
    this.logCartData(totalPriceValue, totalQuantityValue);
  }

  logCartData(totalPriceValue: number, totalQuantityValue: number) {
    console.log(`Cart contents: `);
    for(let cartItem of this.cartItems){
      const subTotalPrice = cartItem.unitPrice * cartItem.quantity;
      console.log(`Item Name=${cartItem.name}, Item Unit Price=${cartItem.unitPrice}, 
                  Item Quantity=${cartItem.quantity}, Subtotal=${subTotalPrice}`);
    }

    console.log(`TotalPrice=${totalPriceValue.toFixed(2)}, TotalQuantity=${totalQuantityValue}`);
    console.log('______________')
  }

  decrementQuantity(cartItem: CartItem) {
    cartItem.quantity--;

    if(cartItem.quantity === 0){
      this.remove(cartItem);
    } else {
      this.computeCartTotals();
    }
  }

  remove(cartItem: CartItem) {
    // get index of the item int he array
    const index = this.cartItems.findIndex( tempCartItem => tempCartItem.id === cartItem.id );

    // if exists, remove the element from the array at index
    if(index > -1){
      this.cartItems.splice(index, 1);
      this.computeCartTotals();
    }
  }
}
