import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { DefaultUrlSerializer, NavigationEnd, Router } from '@angular/router';
import { ViewportScroller } from '@angular/common';
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


describe('Department switching and request ordering', () => {
  const hearing = {id: 1, categoryName: 'Hearing', hasChildren: true};
  const vision = {id: 2, categoryName: 'Vision', hasChildren: true};
  let api: jasmine.SpyObj<ProductService>;
  let events: Subject<any>;
  let router: any;
  let component: ProductCategoryMenuComponent;
  beforeEach(() => {
    events = new Subject();
    router = {url: '/products', events, parseUrl: (url: string) => new DefaultUrlSerializer().parse(url),
      navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(false))};
    api = jasmine.createSpyObj('ProductService', ['getTopLevelCategories', 'getCategoryChildren']);
    api.getTopLevelCategories.and.returnValue(of([hearing, vision]));
    api.getCategoryChildren.and.returnValue(of([]));
    TestBed.configureTestingModule({providers: [ProductCategoryMenuComponent,
      {provide: ProductService, useValue: api}, {provide: Router, useValue: router},
      {provide: ViewportScroller, useValue: {scrollToPosition: jasmine.createSpy('scrollToPosition')}}]});
    component = TestBed.inject(ProductCategoryMenuComponent);
  });
  it('cancels obsolete requests so a slow department cannot overwrite the selected one', () => {
    const first = new Subject<any[]>(); const second = new Subject<any[]>();
    api.getCategoryChildren.and.callFake(id => id === 1 ? first : second);
    component.ngOnInit(); component.selectDepartment(vision, false);
    second.next([{id: 20, categoryName: 'Frames', hasChildren: false}]);
    first.next([{id: 10, categoryName: 'Hearing aids', hasChildren: false}]);
    expect(first.observed).toBeFalse();
    expect(component.activeDepartment.id).toBe(2);
    expect(component.level1Categories[0].categoryName).toBe('Frames');
    expect(component.loading).toBeFalse();
  });
  it('reuses loaded categories and avoids repeated requests for the current department', () => {
    component.ngOnInit(); component.selectDepartment(vision, false);
    component.selectDepartment(hearing, false); component.selectDepartment(hearing, false);
    expect(api.getCategoryChildren).toHaveBeenCalledTimes(2);
  });
  it('follows completed route navigation, including browser back and forward', () => {
    component.ngOnInit();
    router.url = '/category/2?includeDescendants=true';
    events.next(new NavigationEnd(1, router.url, router.url));
    expect(component.activeDepartment.id).toBe(2);
    router.url = '/category/1?includeDescendants=true';
    events.next(new NavigationEnd(2, router.url, router.url));
    expect(component.activeDepartment.id).toBe(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });
  it('restores a previously loaded department when navigating back to its child category', () => {
    api.getCategoryChildren.and.callFake(id => of([{id: id === 1 ? 10 : 20, categoryName: 'Child', hasChildren: false}]));
    component.ngOnInit(); component.selectDepartment(vision, false);
    router.url = '/category/10'; events.next(new NavigationEnd(3, router.url, router.url));
    expect(component.activeDepartment.id).toBe(1);
  });
  it('finishes loading an empty submenu rather than leaving a loading indicator', () => {
    component.onCategoryHoverEnter({id: 20, categoryName: 'Frames', hasChildren: true});
    expect(component.childLoading).toBeFalse(); expect(component.expandedChildren).toEqual([]);
  });
  it('does not navigate or scroll again when selecting the current department route', () => {
    router.url = '/category/1?includeDescendants=true'; component.ngOnInit();
    component.selectDepartment(hearing);
    expect(router.navigate).not.toHaveBeenCalled();
    expect(api.getCategoryChildren).toHaveBeenCalledTimes(1);
  });
  it('clears pending dropdown requests when the user leaves the menu', () => {
    const pending = new Subject<any[]>(); api.getCategoryChildren.and.returnValue(pending);
    component.onCategoryHoverEnter({id: 20, categoryName: 'Frames', hasChildren: true});
    component.onCategoryHoverLeave(); pending.next([{id: 30, categoryName: 'Old response', hasChildren: false}]);
    expect(pending.observed).toBeFalse(); expect(component.expandedCategoryId).toBeNull();
    expect(component.expandedChildren).toEqual([]);
  });
  it('allows retrying a failed department load', () => {
    api.getCategoryChildren.and.returnValue(throwError(() => new Error('offline')));
    component.ngOnInit(); expect(component.error).toContain('retry'); expect(component.loading).toBeFalse();
    api.getCategoryChildren.and.returnValue(of([{id: 10, categoryName: 'Aids', hasChildren: false}]));
    component.selectDepartment(hearing, false);
    expect(component.error).toBe(''); expect(component.level1Categories[0].categoryName).toBe('Aids');
  });
  it('closes an open submenu on a second toggle', () => {
    const category = {id: 20, categoryName: 'Frames', hasChildren: true};
    component.toggleCategory(category); expect(component.expandedCategoryId).toBe(20);
    component.toggleCategory(category); expect(component.expandedCategoryId).toBeNull();
  });
});
