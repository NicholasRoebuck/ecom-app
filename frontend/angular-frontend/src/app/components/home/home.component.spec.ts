import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { ProductService } from '../../services/product.service';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  it('links department panels to the categories returned by the catalog', async () => {
    await TestBed.configureTestingModule({imports: [RouterTestingModule], declarations: [HomeComponent],
      providers: [{provide: ProductService, useValue: {getTopLevelCategories: () => of([
        {id: 1, categoryName: 'Audio care', hasChildren: true}, {id: 2, categoryName: 'Sport eyewear', hasChildren: true}])}}]
    }).compileComponents();
    const fixture = TestBed.createComponent(HomeComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.panel--hearing').getAttribute('href')).toContain('/category/1');
    expect(fixture.nativeElement.querySelector('.panel--vision').getAttribute('href')).toContain('/category/2');
  });
});
