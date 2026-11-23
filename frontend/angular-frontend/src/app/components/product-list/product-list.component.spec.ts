import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { of } from 'rxjs';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { ProductListComponent } from './product-list.component';

describe('ProductListComponent', () => {
  it('loads the first catalog page and finishes loading when the collection is empty', async () => {
    const api = jasmine.createSpyObj('ProductService', ['getFilterOptions', 'getProductCategories', 'getProductListPaginate']);
    api.getFilterOptions.and.returnValue(of({options: []}));
    api.getProductCategories.and.returnValue(of([]));
    api.getProductListPaginate.and.returnValue(of({content: [], page: {number: 0, size: 12, totalElements: 0, totalPages: 0}}));
    await TestBed.configureTestingModule({imports: [RouterTestingModule, NgbPaginationModule], declarations: [ProductListComponent],
      providers: [{provide: ProductService, useValue: api}, {provide: CartService, useValue: {}}]}).compileComponents();
    const fixture = TestBed.createComponent(ProductListComponent); fixture.detectChanges();
    expect(api.getProductListPaginate).toHaveBeenCalledWith(0, 12, undefined, false, 'catalog');
    expect(fixture.componentInstance.products).toEqual([]);
    expect(fixture.componentInstance.loading).toBeFalse();
    expect(fixture.componentInstance.error).toBe('');
  });
});
