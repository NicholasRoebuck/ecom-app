import { TestBed } from '@angular/core/testing';

import { ProductCategoryNavService } from './product-category-nav.service';

describe('ProductCategoryNavService', () => {
  let service: ProductCategoryNavService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProductCategoryNavService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
