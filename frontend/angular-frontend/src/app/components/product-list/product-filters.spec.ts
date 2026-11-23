import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';
import { ProductListComponent } from './product-list.component';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../common/product';
import { ProductVariant } from '../../common/product-variant';

describe('Category filter sidebar', () => {
  let fixture: ComponentFixture<ProductListComponent>;
  let component: ProductListComponent;
  let api: jasmine.SpyObj<ProductService>;
  let router: Router;
  let route: any;
  let params: BehaviorSubject<any>, query: BehaviorSubject<any>;
  const red = new ProductVariant(1, 'RED', 20, 'red.png', true, 0, {Color: 'Red'});
  const blue = new ProductVariant(2, 'BLUE', 40, 'blue.png', true, 3, {Color: 'Blue'});
  const product = new Product(7, 'Glasses', 'Frames', new Date(), new Date(), [red, blue]);
  const response = {content: [product], page: {number: 0, size: 12, totalElements: 24, totalPages: 2}};
  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({id: '3'}));
    query = new BehaviorSubject(convertToParamMap({includeDescendants: 'true'}));
    route = {paramMap: params, queryParamMap: query, snapshot: {paramMap: params.value, queryParamMap: query.value}};
    api = jasmine.createSpyObj('ProductService', ['getProductCategories', 'getProductListPaginate', 'searchProductsPaginate', 'getFilterOptions']);
    api.getProductCategories.and.returnValue(of([{id: 3, categoryName: 'Eyewear'}]));
    api.getProductListPaginate.and.returnValue(of(response)); api.searchProductsPaginate.and.returnValue(of(response));
    api.getFilterOptions.and.returnValue(of({options: [{name: 'Color', values: ['Blue', 'Red']}]}));
    await TestBed.configureTestingModule({declarations: [ProductListComponent], imports: [CommonModule, RouterTestingModule, NgbPaginationModule],
      providers: [{provide: ProductService, useValue: api}, {provide: CartService, useValue: {addToCart: jasmine.createSpy()}},
        {provide: ActivatedRoute, useValue: route}]}).compileComponents();
    router = TestBed.inject(Router); spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    fixture = TestBed.createComponent(ProductListComponent); component = fixture.componentInstance;
  });
  function setQuery(values: Record<string, any>): void {
    const next = convertToParamMap({includeDescendants: 'true', ...values}); route.snapshot.queryParamMap = next; query.next(next); fixture.detectChanges();
  }
  it('loads real options for the current category and does not repeat category navigation in the aside', () => {
    fixture.detectChanges();
    expect(api.getFilterOptions).toHaveBeenCalledWith(3, true, undefined);
    expect(fixture.nativeElement.querySelector('aside').querySelectorAll('a').length).toBe(0);
    expect(fixture.nativeElement.querySelector('#filter-option-0').textContent).toContain('Color');
  });
  it('restores URL state and sends filters to the paginated server request', () => {
    setQuery({minPrice: '25', maxPrice: '50', inStock: 'true', 'option.Color': 'Blue'});
    expect(api.getProductListPaginate).toHaveBeenCalledWith(0, 12, 3, true, 'catalog', {minPrice: 25, maxPrice: 50, inStock: true, options: {Color: 'Blue'}});
    expect(fixture.nativeElement.querySelector('#filter-min-price').value).toBe('25');
    expect(fixture.nativeElement.querySelector('.stock-filter input').checked).toBeTrue();
    expect(fixture.nativeElement.querySelector('#filter-option-0').value).toBe('Blue');
  });
  it('restores selected values when filter options arrive after the shared URL', () => {
    const options = new Subject<any>(); api.getFilterOptions.and.returnValue(options);
    setQuery({'option.Color': 'Blue'});
    options.next({options: [{name: 'Color', values: ['Blue', 'Red']}]}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#filter-option-0').value).toBe('Blue');
  });
  it('resets to page one when filters change and restores state on history changes', () => {
    fixture.detectChanges(); component.pageNumber = 2;
    setQuery({inStock: 'true'}); expect(api.getProductListPaginate.calls.mostRecent().args[0]).toBe(0);
    setQuery({}); expect(component.filters.inStock).toBeFalse();
    setQuery({inStock: 'true'}); expect(component.filters.inStock).toBeTrue();
    expect(api.getFilterOptions).toHaveBeenCalledTimes(1);
  });
  it('applies prices through the URL while preserving category and sort query state', () => {
    fixture.detectChanges(); component.minPriceInput = '0'; component.maxPriceInput = '50';
    component.applyPrices(new Event('submit'));
    expect(router.navigate).toHaveBeenCalledWith([], {relativeTo: route, queryParams: {minPrice: '0', maxPrice: '50'}, queryParamsHandling: 'merge'});
  });
  it('rejects an inverted price range before navigating', () => {
    fixture.detectChanges(); component.minPriceInput = '50'; component.maxPriceInput = '10';
    component.applyPrices(new Event('submit')); fixture.detectChanges();
    expect(router.navigate).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('#filter-price-error').textContent).toContain('Minimum');
  });
  it('uses URL state for availability and option changes', () => {
    fixture.detectChanges(); component.setStock(true);
    expect(router.navigate).toHaveBeenCalledWith([], {relativeTo: route, queryParams: {inStock: 'true'}, queryParamsHandling: 'merge'});
    component.setOption('Color', 'Blue');
    expect(router.navigate).toHaveBeenCalledWith([], {relativeTo: route, queryParams: {'option.Color': 'Blue'}, queryParamsHandling: 'merge'});
  });
  it('clears filters without discarding sort or the category scope', () => {
    setQuery({minPrice: '20', sort: 'name', 'option.Color': 'Blue'}); component.clearFilters();
    expect(router.navigate).toHaveBeenCalledWith([], {relativeTo: route,
      queryParams: {minPrice: null, maxPrice: null, inStock: null, 'option.Color': null}, queryParamsHandling: 'merge'});
  });
  it('keeps filtering available if option discovery fails and offers retry', () => {
    api.getFilterOptions.and.returnValue(throwError(() => new Error('offline'))); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#filter-min-price')).not.toBeNull(); expect(component.filterOptionsError).not.toBe('');
    api.getFilterOptions.and.returnValue(of({options: []})); component.loadFilterOptions(true); fixture.detectChanges();
    expect(component.filterOptionsError).toBe('');
  });
  it('shows the price and image of the variant matching the current filters', () => {
    setQuery({inStock: 'true', 'option.Color': 'Blue'});
    expect(component.minimumPrice(product)).toBe(40); expect(component.displayVariant(product).id).toBe(2);
    expect(fixture.nativeElement.querySelector('.product-image').getAttribute('src')).toBe('blue.png');
    expect(fixture.nativeElement.querySelector('.product-price').textContent).toContain('$40.00');
    expect(fixture.nativeElement.querySelector('.product-add-button').textContent).toContain('Choose options');
  });
  it('offers clear filters for a valid empty result', () => {
    api.getProductListPaginate.and.returnValue(of({...response, content: [], page: {...response.page, totalElements: 0, totalPages: 0}}));
    setQuery({minPrice: '10'});
    expect(fixture.nativeElement.querySelector('.catalog-message').textContent).toContain('No products match these filters');
    expect(fixture.nativeElement.querySelector('.catalog-message button').textContent).toContain('Clear');
  });
  it('cancels obsolete option discovery after changing categories', () => {
    const old = new Subject<any>(); api.getFilterOptions.and.returnValue(old); fixture.detectChanges();
    api.getFilterOptions.and.returnValue(of({options: [{name: 'Frame', values: ['X6']}]}));
    const next = convertToParamMap({id: '4'}); route.snapshot.paramMap = next; params.next(next); fixture.detectChanges();
    old.next({options: [{name: 'Old', values: ['Old']}]});
    expect(old.observed).toBeFalse(); expect(component.filterOptions[0].name).toBe('Frame');
  });
  it('collapses mobile controls behind an accessible toggle', () => {
    fixture.detectChanges(); const toggle: HTMLButtonElement = fixture.nativeElement.querySelector('.filters-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false'); toggle.click(); fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('.catalog-filters').classList.contains('is-open')).toBeTrue();
  });
  it('filters search results without losing the search term', () => {
    const next = convertToParamMap({keyword: 'Glasses'}); route.snapshot.paramMap = next;
    setQuery({inStock: 'true'});
    expect(api.searchProductsPaginate).toHaveBeenCalledWith(0, 12, 'Glasses', 'catalog', {minPrice: undefined, maxPrice: undefined, inStock: true, options: {}});
    expect(api.getFilterOptions).toHaveBeenCalledWith(undefined, true, 'Glasses');
  });
});
