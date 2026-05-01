import { Component } from '@angular/core';
import { Product } from '../../common/product';
import { ProductService } from '../../services/product.service';
import { ActivatedRoute } from '@angular/router';
import { OnInit } from '@angular/core';
import { CartService } from '../../services/cart.service';
import { CartItem } from '../../common/cart-item';

@Component({
  selector: 'app-product-details',
  templateUrl: './product-details.component.html',
  styleUrl: './product-details.component.css'
})
export class ProductDetailsComponent implements OnInit {

  // The "!" is the non-null assertion operator. Tells TypeScript compiler to suspend strict
  product!: Product;

  constructor(private productServive: ProductService,
              private route: ActivatedRoute,
              private cartService: CartService
  ) { }

  ngOnInit(): void {
    this.route.paramMap.subscribe(() => {
      this.handleProductDetails();
    });
  }

  handleProductDetails() {
    // get the id param string. convert string to a number using the + symbol

    const productId: number = +this.route.snapshot.paramMap.get('id')!;

    this.productServive.getProduct(productId).subscribe(
      data => {
        this.product = data;
      }
    );
  }

  addTocart() {

    console.log(`Adding to cart: ${this.product.name}, ${this.product.unitPrice}`);

    const cartItem = new CartItem(this.product);

    this.cartService.addToCart(cartItem);
  }
}
