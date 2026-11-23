import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { ProductListComponent } from './product-list.component';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../common/product';
import { ProductVariant } from '../../common/product-variant';

describe('ProductListComponent variant purchase guard', () => {
  let component: ProductListComponent;
  let cart: jasmine.SpyObj<CartService>;
  const variant = new ProductVariant(1, 'SKU', 10, '', true, 2);
  const product = new Product(7, 'Product', '', new Date(), new Date(), [variant]);
  beforeEach(() => {
    cart = jasmine.createSpyObj('CartService', ['addToCart']);
    TestBed.configureTestingModule({providers: [ProductListComponent,
      {provide: CartService, useValue: cart}, {provide: ProductService, useValue: {}},
      {provide: ActivatedRoute, useValue: {}}, {provide: Router, useValue: {navigate: jasmine.createSpy('navigate')}}]});
    component = TestBed.inject(ProductListComponent);
  });
  it('does not choose the first variant for a product with multiple options', () => {
    component.addToCart({...product, variants: [variant, {...variant, id: 2}]});
    expect(cart.addToCart).not.toHaveBeenCalled();
  });
  it('allows a purchasable single variant', () => {
    component.addToCart(product);
    expect(cart.addToCart.calls.mostRecent().args[0].variantId).toBe(1);
  });
  it('does not add inactive, empty or out-of-stock products', () => {
    component.addToCart({...product, variants: []});
    component.addToCart({...product, variants: [{...variant, active: false}]});
    component.addToCart({...product, variants: [{...variant, unitsInStock: 0}]});
    expect(cart.addToCart).not.toHaveBeenCalled();
  });
});


describe('ProductListComponent collection browsing', () => {
  let fixture: ComponentFixture<ProductListComponent>;
  let component: ProductListComponent;
  let api: jasmine.SpyObj<ProductService>;
  let router: Router;
  let route: any;
  let params: BehaviorSubject<any>;
  let query: BehaviorSubject<any>;
  const variant = new ProductVariant(1, 'BLACK', 20, 'https://example.com/black.jpg', true, 3);
  const product = new Product(7, 'Example glasses', 'A useful product description.', new Date(), new Date(), [variant]);
  const response = {content: [product], page: {number: 0, size: 12, totalElements: 24, totalPages: 2}};
  beforeEach(async () => {
    params = new BehaviorSubject(convertToParamMap({id: '3'}));
    query = new BehaviorSubject(convertToParamMap({includeDescendants: 'true'}));
    route = {paramMap: params, queryParamMap: query,
      snapshot: {paramMap: params.value, queryParamMap: query.value}};
    api = jasmine.createSpyObj('ProductService', ['getFilterOptions', 'getProductCategories', 'getProductListPaginate', 'searchProductsPaginate']);
    api.getFilterOptions.and.returnValue(of({options: []}));
    api.getProductCategories.and.returnValue(of([{id: 3, categoryName: 'Eyewear'}]));
    api.getProductListPaginate.and.returnValue(of(response)); api.searchProductsPaginate.and.returnValue(of(response));
    await TestBed.configureTestingModule({
      declarations: [ProductListComponent], imports: [CommonModule, RouterTestingModule, NgbPaginationModule],
      providers: [{provide: ProductService, useValue: api}, {provide: CartService, useValue: jasmine.createSpyObj('CartService', ['addToCart'])},
        {provide: ActivatedRoute, useValue: route}]
    }).compileComponents();
    router = TestBed.inject(Router); spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
    fixture = TestBed.createComponent(ProductListComponent); component = fixture.componentInstance; fixture.detectChanges();
  });
  it('shows the actual category, result range, product description and selected category', () => {
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Eyewear');
    expect(fixture.nativeElement.querySelector('.catalog-count').textContent).toContain('1-12 of 24');
    expect(fixture.nativeElement.querySelector('.product-excerpt').textContent).toContain('useful product');
    expect(fixture.nativeElement.querySelector('#catalog-category').value).toBe('3');
    expect(api.getProductListPaginate).toHaveBeenCalledWith(0, 12, 3, true, 'catalog');
  });
  it('navigates category choices with descendant products included', () => {
    component.browseCategory('4');
    expect(router.navigate).toHaveBeenCalledWith(['/category', 4], {queryParams: {includeDescendants: true, sort: 'catalog'}});
  });
  it('preserves current query filters when selecting a sort', () => {
    component.changeSort('name');
    expect(router.navigate).toHaveBeenCalledWith([], {relativeTo: route, queryParams: {sort: 'name'}, queryParamsHandling: 'merge'});
  });
  it('requests server sorting and resets the page when query sort changes', () => {
    component.pageNumber = 2;
    const updated = convertToParamMap({sort: 'newest', includeDescendants: 'true'});
    route.snapshot.queryParamMap = updated; query.next(updated);
    expect(api.getProductListPaginate).toHaveBeenCalledWith(0, 12, 3, true, 'newest');
  });
  it('handles search headings and sends the search term to the search API', () => {
    const updated = convertToParamMap({keyword: 'red glasses'});
    route.snapshot.paramMap = updated; params.next(updated); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Search results');
    expect(fixture.nativeElement.querySelector('.collection-description').textContent).toContain('red glasses');
    expect(api.searchProductsPaginate).toHaveBeenCalledWith(0, 12, 'red glasses', 'catalog');
    expect(fixture.nativeElement.querySelector('#catalog-category')).toBeNull();
  });
  it('does not show empty results while loading and offers retry after errors', () => {
    const pending = new Subject<any>(); api.getProductListPaginate.and.returnValue(pending);
    component.listProduct(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('No products found');
    pending.error(new Error('unavailable')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('could not be loaded');
    api.getProductListPaginate.and.returnValue(of(response));
    fixture.nativeElement.querySelector('[role=alert] button').click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.product-card')).toBeTruthy();
  });
  it('does not allow stale requests to replace a newer collection', () => {
    const old = new Subject<any>(); api.getProductListPaginate.and.returnValue(old);
    component.listProduct();
    api.getProductListPaginate.and.returnValue(of(response)); component.listProduct();
    expect(old.observed).toBeFalse();
    old.next({...response, content: []});
    expect(component.products.length).toBe(1);
  });
  it('uses a range price and actual available image without adding arbitrary variants', () => {
    const varied = {...product, variants: [{...variant, active: false}, {...variant, id: 2, unitPrice: 30}, {...variant, id: 3, unitPrice: 40}]};
    expect(component.minimumPrice(varied)).toBe(30); expect(component.hasPriceRange(varied)).toBeTrue();
    expect(component.displayVariant(varied).id).toBe(2);
  });
});
