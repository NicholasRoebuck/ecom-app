import { Injectable, OnInit } from '@angular/core';
import { CartItem } from '../common/cart-item';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnInit {

  cartItems: CartItem[] = [];

  totalPrice: Subject<number> = new Subject<number>();
  totalQuantity: Subject<number> = new Subject<number>();


  constructor() { }

  ngOnInit(): void {
    
  }

  addToCart(cartItem: CartItem) {
    
    // check if item is already in cart
    let alreadyExistsInCart: boolean = false;
    let existingCartItem: CartItem = undefined;

    if(this.cartItems.length > 0){
      // find the item in the cart based on item id
      for (let tempCartItem of this.cartItems){
        if (tempCartItem.id === cartItem.id){
          existingCartItem = tempCartItem;
          break;
        }
      }
      
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
    throw new Error('Method not implemented.');
  }
}
