import { environment } from '../../environments/environment';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, HttpClientTestingModule } from '@angular/common/http/testing';

import { ProductService } from './product.service';

describe('ProductService', () => {
  let service: ProductService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule]
    });
    service = TestBed.inject(ProductService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('requests all products when no category is selected', () => {
    service.getProductListPaginate(0, 10).subscribe();

    const request = httpMock.expectOne(
      environment['premearAppApiUrl'] + '/products?page=0&size=10&sort=catalog'
    );
    expect(request.request.method).toBe('GET');
    request.flush({ content: [], page: { size: 10, totalElements: 0, totalPages: 0, number: 0 } });
  });

  it('requests products from a department and its descendants', () => {
    service.getProductListPaginate(0, 10, 1, true).subscribe();

    const request = httpMock.expectOne(
      environment['premearAppApiUrl'] + '/products/category/1?page=0&size=10&includeDescendants=true&sort=catalog'
    );
    expect(request.request.method).toBe('GET');
    request.flush({ content: [], page: { size: 10, totalElements: 0, totalPages: 0, number: 0 } });
  });
  it('sends encoded option filters to the server and scopes option discovery', () => {
    service.getProductListPaginate(1, 12, 3, true, 'name', {minPrice: 0, inStock: true, options: {'Lens type': 'Rose & Gold'}}).subscribe();
    const request = httpMock.expectOne(req => req.url.includes('/products/category/3?'));
    const params = new URL(request.request.url, 'https://example.test').searchParams;
    expect(params.get('minPrice')).toBe('0'); expect(params.get('option.Lens type')).toBe('Rose & Gold');
    expect(params.get('page')).toBe('1'); expect(params.get('inStock')).toBe('true'); request.flush({content: [], page: {}});
    service.getFilterOptions(3, true).subscribe();
    const facets = httpMock.expectOne(environment['premearAppApiUrl'] + '/products/filters?categoryId=3&includeDescendants=true');
    expect(facets.request.method).toBe('GET'); facets.flush({options: []});
  });
});
