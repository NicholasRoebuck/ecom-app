import { ElementRef } from '@angular/core';
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


describe('ProductCategoryMenuComponent switching', () => {
  const hearing = {id: 1, categoryName: 'Hearing', hasChildren: true};
  const vision = {id: 2, categoryName: 'Vision', hasChildren: true};
  let api: jasmine.SpyObj<ProductService>;
  let router: any;
  let events: Subject<NavigationEnd>;
  let component: ProductCategoryMenuComponent;
  let viewport: jasmine.SpyObj<ViewportScroller>;
  beforeEach(() => {
    events = new Subject<NavigationEnd>();
    router = {url: '/products', events, parseUrl: (url: string) => new DefaultUrlSerializer().parse(url),
      navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(false))};
    viewport = jasmine.createSpyObj('ViewportScroller', ['scrollToPosition']);
    api = jasmine.createSpyObj('ProductService', ['getTopLevelCategories', 'getCategoryChildren']);
    api.getTopLevelCategories.and.returnValue(of([hearing, vision]));
    api.getCategoryChildren.and.callFake(id => of([{id: id * 10, categoryName: id === 1 ? 'Hearing aids' : 'Frames', hasChildren: true}]));
    TestBed.configureTestingModule({providers: [ProductCategoryMenuComponent,
      {provide: ElementRef, useValue: new ElementRef(document.createElement('div'))},
      {provide: ProductService, useValue: api}, {provide: Router, useValue: router},
      {provide: ViewportScroller, useValue: viewport}]});
    component = TestBed.inject(ProductCategoryMenuComponent);
  });
  function navigate(url: string): void {
    router.url = url; events.next(new NavigationEnd(1, url, url));
  }
  it('cancels the old department request and ignores a late response', () => {
    const old = new Subject<any[]>(), latest = new Subject<any[]>();
    api.getCategoryChildren.and.callFake(id => id === 1 ? old : latest);
    component.ngOnInit(); component.selectDepartment(vision, false);
    latest.next([{id: 20, categoryName: 'Frames', hasChildren: false}]);
    old.next([{id: 10, categoryName: 'Old hearing result', hasChildren: false}]);
    expect(old.observed).toBeFalse(); expect(component.activeDepartment.id).toBe(2);
    expect(component.level1Categories[0].categoryName).toBe('Frames');
  });
  it('clears old categories while the newly selected department loads', () => {
    component.ngOnInit();
    api.getCategoryChildren.and.returnValue(new Subject());
    component.selectDepartment(vision, false);
    expect(component.level1Categories).toEqual([]);
  });
  it('follows browser back and forward between departments without issuing navigation', () => {
    component.ngOnInit();
    navigate('/category/2?includeDescendants=true'); expect(component.activeDepartment.id).toBe(2);
    navigate('/category/1?includeDescendants=true'); expect(component.activeDepartment.id).toBe(1);
    navigate('/category/2?includeDescendants=true'); expect(component.activeDepartment.id).toBe(2);
    expect(router.navigate).not.toHaveBeenCalled(); expect(viewport.scrollToPosition).not.toHaveBeenCalled();
  });
  it('restores the department of previously loaded child and grandchild category routes', () => {
    component.ngOnInit();
    api.getCategoryChildren.and.callFake(id => of(id === 10
      ? [{id: 11, categoryName: 'Child', hasChildren: false}]
      : [{id: id * 10, categoryName: 'Department category', hasChildren: true}]));
    component.onCategoryHoverEnter({id: 10, categoryName: 'Hearing aids', hasChildren: true});
    component.selectDepartment(vision, false);
    navigate('/category/11'); expect(component.activeDepartment.id).toBe(1);
    component.selectDepartment(vision, false);
    navigate('/category/10'); expect(component.activeDepartment.id).toBe(1);
  });
  it('selects the correct department for an initial direct department URL', () => {
    router.url = '/category/2?includeDescendants=true'; component.ngOnInit();
    expect(component.activeDepartment.id).toBe(2);
    expect(api.getCategoryChildren).toHaveBeenCalledOnceWith(2);
  });
  it('does not duplicate a request for an already loaded department', () => {
    component.ngOnInit(); component.selectDepartment(hearing, false);
    component.selectDepartment(vision, false); component.selectDepartment(hearing, false);
    expect(api.getCategoryChildren).toHaveBeenCalledTimes(2);
  });
  it('cancels submenu requests on switching department or leaving a submenu', () => {
    component.ngOnInit();
    const pending = new Subject<any[]>(); api.getCategoryChildren.and.returnValue(pending);
    component.onCategoryHoverEnter({id: 10, categoryName: 'Hearing aids', hasChildren: true});
    component.onCategoryHoverLeave(); pending.next([{id: 11, categoryName: 'Late', hasChildren: false}]);
    expect(pending.observed).toBeFalse(); expect(component.expandedChildren).toEqual([]);
    expect(component.expandedCategoryId).toBeNull();
  });
  it('allows a failed department request to be retried', () => {
    api.getCategoryChildren.and.returnValue(throwError(() => new Error('offline')));
    component.ngOnInit(); expect(component.level1Categories).toEqual([]);
    api.getCategoryChildren.and.returnValue(of([{id: 10, categoryName: 'Hearing aids', hasChildren: false}]));
    component.selectDepartment(hearing, false);
    expect(component.level1Categories[0].categoryName).toBe('Hearing aids');
  });
  it('cancels pending requests when the menu is destroyed', () => {
    const pending = new Subject<any[]>(); api.getCategoryChildren.and.returnValue(pending);
    component.ngOnInit(); expect(pending.observed).toBeTrue();
    TestBed.resetTestingModule(); expect(pending.observed).toBeFalse();
  });
  it('does not scroll to the top for an ignored or cancelled navigation', async () => {
    component.ngOnInit(); component.selectDepartment(vision);
    await Promise.resolve(); expect(viewport.scrollToPosition).not.toHaveBeenCalled();
    router.navigate.and.returnValue(Promise.resolve(true)); component.selectDepartment(hearing);
    await Promise.resolve(); expect(viewport.scrollToPosition).toHaveBeenCalledWith([0, 0]);
  });
});


describe('ProductCategoryMenuComponent accessible submenus', () => {
  let fixture: any;
  let api: jasmine.SpyObj<ProductService>;
  beforeEach(async () => {
    api = jasmine.createSpyObj('ProductService', ['getTopLevelCategories', 'getCategoryChildren']);
    api.getTopLevelCategories.and.returnValue(of([{id: 1, categoryName: 'Hearing', hasChildren: true}]));
    api.getCategoryChildren.and.callFake(id => of(id === 1
      ? [{id: 10, categoryName: 'Hearing aids', hasChildren: true}]
      : [{id: 11, categoryName: 'In-ear', hasChildren: false}]));
    await TestBed.configureTestingModule({imports: [RouterTestingModule], declarations: [ProductCategoryMenuComponent],
      providers: [{provide: ProductService, useValue: api}]}).compileComponents();
    fixture = TestBed.createComponent(ProductCategoryMenuComponent); fixture.detectChanges();
  });
  function toggle(): HTMLButtonElement { return fixture.nativeElement.querySelector('.category-expand'); }
  it('retains the parent category link and adds a labeled disclosure button', () => {
    expect(fixture.nativeElement.querySelector('.category-link').getAttribute('href')).toBe('/category/10');
    expect(toggle().tagName).toBe('BUTTON'); expect(toggle().type).toBe('button');
    expect(toggle().getAttribute('aria-label')).toBe('Subcategories for Hearing aids');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });
  it('opens and closes by clicking the caret without navigating away', () => {
    toggle().click(); fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(toggle().getAttribute('aria-controls')).toBe('subcategory-menu-10');
    expect(fixture.nativeElement.querySelector('.nav-dropdown a').getAttribute('href')).toBe('/category/11');
    toggle().click(); fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('.nav-dropdown')).toBeNull();
  });
  it('focuses the first submenu link with Arrow Down and returns to the caret with Escape', async () => {
    toggle().focus(); toggle().dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}));
    fixture.detectChanges(); await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.nav-dropdown a');
    expect(document.activeElement).toBe(link);
    link.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true})); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.nav-dropdown')).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });
  it('does not open on a touch pointer entering before its click', () => {
    const row = fixture.nativeElement.querySelector('.level1-item');
    row.dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'touch'})); fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    toggle().click(); fixture.detectChanges(); expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
  it('retains mouse hover and lets a click keep the submenu open', () => {
    const row = fixture.nativeElement.querySelector('.level1-item');
    row.dispatchEvent(new PointerEvent('pointerenter', {pointerType: 'mouse'})); fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click(); row.dispatchEvent(new PointerEvent('pointerleave', {pointerType: 'mouse'})); fixture.detectChanges();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });
  it('dismisses the submenu on an outside click', () => {
    toggle().click(); fixture.detectChanges(); document.body.click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.nav-dropdown')).toBeNull();
  });
  it('dismisses the submenu when keyboard focus leaves its category', () => {
    toggle().click(); fixture.detectChanges();
    fixture.nativeElement.querySelector('.level1-item').dispatchEvent(new FocusEvent('focusout', {relatedTarget: document.body}));
    fixture.detectChanges(); expect(fixture.nativeElement.querySelector('.nav-dropdown')).toBeNull();
  });
  it('handles an empty response without leaving a permanent loading indicator', () => {
    api.getCategoryChildren.and.returnValue(of([])); toggle().click(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.nav-dropdown').textContent).toContain('No subcategories');
  });
});
