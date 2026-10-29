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
      'https://localhost:8443/api/products?page=0&size=10'
    );
    expect(request.request.method).toBe('GET');
    request.flush({ content: [], page: { size: 10, totalElements: 0, totalPages: 0, number: 0 } });
  });

  it('requests products from a department and its descendants', () => {
    service.getProductListPaginate(0, 10, 1, true).subscribe();

    const request = httpMock.expectOne(
      'https://localhost:8443/api/products/category/1?page=0&size=10&includeDescendants=true'
    );
    expect(request.request.method).toBe('GET');
    request.flush({ content: [], page: { size: 10, totalElements: 0, totalPages: 0, number: 0 } });
  });
});
