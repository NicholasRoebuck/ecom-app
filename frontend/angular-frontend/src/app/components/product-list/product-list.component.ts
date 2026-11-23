import { CatalogFilters, CatalogOption, readCatalogFilters, matchesCatalogFilters } from '../../common/catalog-filters';
import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
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
  styleUrls: ['./product-list.component.css', './product-catalog.css', './product-filters.css']
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
  filters: CatalogFilters = {options: {}};
  filterOptions: CatalogOption[] = [];
  filtersOpen = false;
  filterOptionsLoading = false;
  filterOptionsError = '';
  filterValidationError = '';
  minPriceInput = '';
  maxPriceInput = '';
  private filterContext = '';
  private filterRequest?: Subscription;
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
    this.request?.unsubscribe(); this.loading = true; this.error = ''; this.products = [];
    this.minPriceInput = query.get('minPrice') || '';
    this.maxPriceInput = query.get('maxPrice') || '';
    this.filterValidationError = '';
    this.loadFilterOptions();
    try { this.filters = readCatalogFilters(query); }
    catch (error: any) {
      this.filterValidationError = error.message;
      this.error = 'Check the filter values and try again.';
      this.filters = {options: {}}; this.totalElements = 0; this.loading = false; return;
    }
    const key = JSON.stringify([this.searchMode, this.keyword, this.currentCategoryId, includeDescendants, this.sortOrder, this.filters]);
    if (key !== this.viewKey) { this.pageNumber = 1; this.viewKey = key; }
    const request = this.searchMode
      ? (this.hasFilters ? this.productService.searchProductsPaginate(this.pageNumber - 1, this.pageSize, this.keyword, this.sortOrder, this.filters)
        : this.productService.searchProductsPaginate(this.pageNumber - 1, this.pageSize, this.keyword, this.sortOrder))
      : (this.hasFilters ? this.productService.getProductListPaginate(this.pageNumber - 1, this.pageSize,
          this.currentCategoryId ?? undefined, includeDescendants, this.sortOrder, this.filters)
        : this.productService.getProductListPaginate(this.pageNumber - 1, this.pageSize,
          this.currentCategoryId ?? undefined, includeDescendants, this.sortOrder));
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
  get hasFilters(): boolean {
    return this.filters.minPrice != null || this.filters.maxPrice != null || !!this.filters.inStock || Object.keys(this.filters.options).length > 0;
  }
  get activeFilterCount(): number {
    return Number(this.filters.minPrice != null || this.filters.maxPrice != null) + Number(!!this.filters.inStock) + Object.keys(this.filters.options).length;
  }
  loadFilterOptions(force = false): void {
    const descendants = this.route.snapshot.queryParamMap.get('includeDescendants') === 'true';
    const context = JSON.stringify([this.currentCategoryId, descendants, this.searchMode ? this.keyword : null]);
    if (!force && context === this.filterContext) return;
    this.filterContext = context; this.filterRequest?.unsubscribe(); this.filterOptions = [];
    this.filterOptionsLoading = true; this.filterOptionsError = '';
    this.filterRequest = this.productService.getFilterOptions(this.currentCategoryId ?? undefined, descendants,
      this.searchMode ? this.keyword : undefined).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: result => { this.filterOptions = result.options; this.filterOptionsLoading = false; },
        error: () => { this.filterOptionsLoading = false; this.filterOptionsError = 'Product options could not be loaded.'; }
      });
  }
  applyPrices(event: Event): void {
    event.preventDefault();
    const query: Record<string,string> = {};
    if (this.minPriceInput.trim()) query['minPrice'] = this.minPriceInput.trim();
    if (this.maxPriceInput.trim()) query['maxPrice'] = this.maxPriceInput.trim();
    try { readCatalogFilters(convertToParamMap(query)); }
    catch (error: any) { this.filterValidationError = error.message; return; }
    this.filterValidationError = '';
    this.updateFilters({minPrice: query['minPrice'] || null, maxPrice: query['maxPrice'] || null});
  }
  setStock(checked: boolean): void { this.updateFilters({inStock: checked ? 'true' : null}); }
  setOption(name: string, value: string): void { this.updateFilters({['option.' + name]: value || null}); }
  clearFilters(): void {
    const changes: Record<string,string | null> = {minPrice: null, maxPrice: null, inStock: null};
    this.route.snapshot.queryParamMap.keys.filter(key => key.startsWith('option.')).forEach(key => changes[key] = null);
    this.updateFilters(changes);
  }
  private updateFilters(queryParams: Record<string,string | null>): void {
    this.router.navigate([], {relativeTo: this.route, queryParams, queryParamsHandling: 'merge'});
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
    if (this.hasFilters) return product.variants.find(variant => matchesCatalogFilters(variant, this.filters));
    return product.variants.find(variant => variant.active && variant.unitsInStock > 0) ||
      product.variants.find(variant => variant.active) || product.variants[0];
  }
  minimumPrice(product: Product): number | null {
    const active = product.variants.filter(variant => this.hasFilters ? matchesCatalogFilters(variant, this.filters) : variant.active);
    const prices = (this.hasFilters ? active : active.length ? active : product.variants).map(variant => variant.unitPrice).filter(Number.isFinite);
    return prices.length ? Math.min(...prices) : null;
  }
  hasPriceRange(product: Product): boolean {
    const prices = product.variants.filter(variant => this.hasFilters ? matchesCatalogFilters(variant, this.filters) : variant.active).map(variant => variant.unitPrice).filter(Number.isFinite);
    return prices.length > 1 && Math.min(...prices) !== Math.max(...prices);
  }
  shortDescription(product: Product): string {
    return (product.description || '').replace(/<[^>]*>/g, '').trim();
  }
}
