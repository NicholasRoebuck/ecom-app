import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { ProductCategoryNavService } from './product-category-nav.service';

describe('ProductCategoryNavService', () => {
  let service: ProductCategoryNavService;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(ProductCategoryNavService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
