import { Component } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { Product } from '../../common/product';
import { OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CartItem } from '../../common/cart-item';
import { CartService } from '../../services/cart.service';
import { getDisplayVariant } from '../../common/product-variant-utils';
import { combineLatest } from 'rxjs';

@Component({
  selector: 'app-product-list',
  templateUrl: './product-list-grid.component.html',
  styleUrl: './product-list.component.css'
})
export class ProductListComponent implements OnInit {

  products: Product[] = [];
  currentCategoryId: number | null = null;
  previousCategoryId: number | null = null;
  previousIncludeDescendants = false;
  searchMode: boolean = false;

  // properties for pagination
  pageNumber: number = 1;
  pageSize: number = 10;
  totalElements: number = 0;

  previousKeyword: string = "";


  constructor(private productService: ProductService,
              private route: ActivatedRoute,
              private cartService: CartService) { }

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(() => {
      this.listProduct();
    });
  }

  listProduct() {

    this.searchMode = this.route.snapshot.paramMap.has('keyword');

    if (this.searchMode) {
      this.handleSearchProducts();
    } else {
      this.handleListProducts();
    }

  }

  handleSearchProducts() {
    const keyword: string = this.route.snapshot.paramMap.get('keyword')!;

    // if we have a differenet keyword than the previous keyword
    // we set the pagenumber to 1

    if (this.previousKeyword != keyword) {
      this.pageNumber = 1;
    }

    this.previousKeyword = keyword;
    console.log(`keyword=${keyword}, pageNumber=${this.pageNumber}`)

    // now search for the products using the keyword

    this.productService.searchProductsPaginate(this.pageNumber - 1, this.pageSize, keyword)
      .subscribe(this.processResult());

  }

  handleListProducts() {
    const categoryId = this.route.snapshot.paramMap.get('id');
    this.currentCategoryId = categoryId === null ? null : +categoryId;
    const includeDescendants = this.route.snapshot.queryParamMap.get('includeDescendants') === 'true';

    //
    // check if category id is different
    // anguale will resue a component if it is currently being used: manage the state
    //

    // if there a different page category id than previous
    // set the pageNumber to 1
    if (this.previousCategoryId != this.currentCategoryId ||
        this.previousIncludeDescendants !== includeDescendants) {
      this.pageNumber = 1;
    }

    this.previousCategoryId = this.currentCategoryId;
    this.previousIncludeDescendants = includeDescendants;

    console.log(`currentcategoryId=${this.currentCategoryId}, pageNumber=${this.pageNumber}`);


    // now get the products for this category id
    this.productService.getProductListPaginate(
      this.pageNumber - 1,
      this.pageSize,
      this.currentCategoryId ?? undefined,
      includeDescendants
    )
      .subscribe(this.processResult());
  }

  updatePageSize(pageSize: string) {
    this.pageSize = +pageSize;
    this.pageNumber = 1;
    this.listProduct();
  }

  processResult() {
    return (data: any) => {
      this.products = data.content;
      this.pageNumber = data.page.number + 1;
      this.pageSize = data.page.size;
      this.totalElements = data.page.totalElements;
    }
  }

  addToCart(product: Product) {
    const variant = getDisplayVariant(product);
    console.log(`product=${product.name} & product price=${variant ? variant.unitPrice : 'n/a'}`);

    const theCartItem = new CartItem(product);
    
    this.cartService.addToCart(theCartItem);
  }

  displayVariant(product: Product) {
    return getDisplayVariant(product);
  }
}
