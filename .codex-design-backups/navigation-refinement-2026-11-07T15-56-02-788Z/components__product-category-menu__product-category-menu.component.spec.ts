import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ProductService } from '../../services/product.service';
import { ProductCategoryMenuComponent } from './product-category-menu.component';

describe('ProductCategoryMenuComponent', () => {
  it('selects the first department and loads its category links', async () => {
    const api = jasmine.createSpyObj('ProductService', ['getTopLevelCategories', 'getCategoryChildren']);
    api.getTopLevelCategories.and.returnValue(of([{id: 2, categoryName: 'Vision', hasChildren: true}]));
    api.getCategoryChildren.and.returnValue(of([{id: 3, categoryName: 'Frames', hasChildren: false}]));
    await TestBed.configureTestingModule({imports: [RouterTestingModule], declarations: [ProductCategoryMenuComponent],
      providers: [{provide: ProductService, useValue: api}]}).compileComponents();
    const fixture = TestBed.createComponent(ProductCategoryMenuComponent); fixture.detectChanges();
    expect(api.getCategoryChildren).toHaveBeenCalledWith(2);
    expect(fixture.nativeElement.querySelector('.department-button').getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.querySelector('.category-link').textContent).toContain('Frames');
  });
});
