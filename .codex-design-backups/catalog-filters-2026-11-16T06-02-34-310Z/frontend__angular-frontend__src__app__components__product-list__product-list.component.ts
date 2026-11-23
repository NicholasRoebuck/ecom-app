import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProductService } from '../../services/product.service';
import { Product } from '../../common/product';
import { ProductCategory } from '../../common/product-category';
import { CartItem } from '../../common/cart-item';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-product-list', templateUrl: './product-list-grid.component.html',
  styleUrls: ['./product-list.component.css', './product-catalog.css']
})
export class ProductListComponent implements OnInit {
  products: Product[] = [];
  categories: ProductCategory[] = [];
  currentCategoryId: number | null = null;
  searchMode = false;
  keyword = '';
  pageNumber = 1;
  pageSize = 12;
  totalElements = 0;
  sortOrder = 'catalog';
  loading = true;
  error = '';
  private viewKey = '';
  private request?: Subscription;
  private readonly destroyRef = inject(DestroyRef);

  constructor(private productService: ProductService, private route: ActivatedRoute,
              private cartService: CartService, private router: Router) {}

  ngOnInit(): void {
    this.productService.getProductCategories().pipe(catchError(() => of([])),
      takeUntilDestroyed(this.destroyRef)).subscribe(categories => this.categories = categories);
    combineLatest([this.route.paramMap, this.route.queryParamMap]).pipe(
      takeUntilDestroyed(this.destroyRef)).subscribe(() => this.listProduct());
  }
  get categoryName(): string {
    return this.categories.find(category => category.id === this.currentCategoryId)?.categoryName || 'Collection';
  }
  get collectionTitle(): string {
    return this.searchMode ? 'Search results' : this.currentCategoryId == null ? 'Explore the collection' : this.categoryName;
  }
  get collectionDescription(): string {
    return this.searchMode ? 'Results for "' + this.keyword + '".' :
      this.currentCategoryId == null ? 'Browse the collection and compare the available styles and options.' :
      'Explore ' + this.categoryName.toLowerCase() + ' and find the options that suit you.';
  }
  get firstResult(): number { return this.totalElements ? (this.pageNumber - 1) * this.pageSize + 1 : 0; }
  get lastResult(): number { return Math.min(this.pageNumber * this.pageSize, this.totalElements); }

  listProduct(): void {
    const params = this.route.snapshot.paramMap;
    const query = this.route.snapshot.queryParamMap;
    this.searchMode = params.has('keyword');
    this.keyword = this.searchMode ? params.get('keyword') || '' : '';
    this.currentCategoryId = !this.searchMode && params.has('id') ? Number(params.get('id')) : null;
    const includeDescendants = query.get('includeDescendants') === 'true';
    const requestedSort = query.get('sort') || 'catalog';
    this.sortOrder = ['catalog', 'name', 'name-desc', 'newest'].includes(requestedSort) ? requestedSort : 'catalog';
    const key = JSON.stringify([this.searchMode, this.keyword, this.currentCategoryId, includeDescendants, this.sortOrder]);
    if (key !== this.viewKey) { this.pageNumber = 1; this.viewKey = key; }
    this.request?.unsubscribe(); this.loading = true; this.error = ''; this.products = [];
    const request = this.searchMode
      ? this.productService.searchProductsPaginate(this.pageNumber - 1, this.pageSize, this.keyword, this.sortOrder)
      : this.productService.getProductListPaginate(this.pageNumber - 1, this.pageSize,
          this.currentCategoryId ?? undefined, includeDescendants, this.sortOrder);
    this.request = request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.products = data.content; this.pageNumber = data.page.number + 1;
        this.pageSize = data.page.size; this.totalElements = data.page.totalElements; this.loading = false;
      },
      error: () => {
        this.loading = false; this.totalElements = 0;
        this.error = 'Products could not be loaded. Please try again.';
      }
    });
  }
  browseCategory(value: string): void {
    if (value) this.router.navigate(['/category', Number(value)], {queryParams: {includeDescendants: true, sort: this.sortOrder}});
    else this.router.navigate(['/products'], {queryParams: {sort: this.sortOrder}});
  }
  changeSort(value: string): void {
    if (!['catalog', 'name', 'name-desc', 'newest'].includes(value)) return;
    this.router.navigate([], {relativeTo: this.route, queryParams: {sort: value}, queryParamsHandling: 'merge'});
  }
  updatePageSize(value: string): void {
    const size = Number(value);
    if (![12, 24, 48].includes(size)) return;
    this.pageSize = size; this.pageNumber = 1; this.listProduct();
  }
  addToCart(product: Product): void {
    if (product.variants.length !== 1) return;
    const variant = this.displayVariant(product);
    if (!variant?.active || variant.unitsInStock <= 0) return;
    this.cartService.addToCart(new CartItem(product));
  }
  displayVariant(product: Product) {
    return product.variants.find(variant => variant.active && variant.unitsInStock > 0) ||
      product.variants.find(variant => variant.active) || product.variants[0];
  }
  minimumPrice(product: Product): number | null {
    const active = product.variants.filter(variant => variant.active);
    const prices = (active.length ? active : product.variants).map(variant => variant.unitPrice).filter(Number.isFinite);
    return prices.length ? Math.min(...prices) : null;
  }
  hasPriceRange(product: Product): boolean {
    const prices = product.variants.filter(variant => variant.active).map(variant => variant.unitPrice).filter(Number.isFinite);
    return prices.length > 1 && Math.min(...prices) !== Math.max(...prices);
  }
  shortDescription(product: Product): string {
    return (product.description || '').replace(/<[^>]*>/g, '').trim();
  }
}
