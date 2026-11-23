import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { PendingCheckoutService } from './services/pending-checkout.service';

@Component({selector: 'app-search, app-login-status, app-cart-status', template: ''})
class NavigationStubComponent {}
@Component({selector: 'app-product-category-menu', template: ''})
class DepartmentStubComponent { activeDepartment = null; }

describe('AppComponent', () => {
  let pending: jasmine.SpyObj<PendingCheckoutService>;
  beforeEach(async () => {
    pending = jasmine.createSpyObj('PendingCheckoutService', ['start']);
    await TestBed.configureTestingModule({imports: [RouterTestingModule],
      declarations: [AppComponent, NavigationStubComponent, DepartmentStubComponent],
      providers: [{provide: PendingCheckoutService, useValue: pending}]
    }).compileComponents();
  });
  it('starts pending checkout recovery when the app opens', () => {
    TestBed.createComponent(AppComponent);
    expect(pending.start).toHaveBeenCalledTimes(1);
  });
  it('renders the navigation and routed content outlet', () => {
    const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav.site-navbar')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-cart-status')).not.toBeNull();
  });
  it('updates the navigation appearance after scrolling', () => {
    const fixture = TestBed.createComponent(AppComponent);
    spyOnProperty(window, 'scrollY', 'get').and.returnValue(10);
    fixture.componentInstance.onWindowScroll(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav').classList.contains('scrolled')).toBeTrue();
  });
  it('maps the footer and navbar contact links to the appropriate help sections', () => {
    const fixture = TestBed.createComponent(AppComponent); fixture.detectChanges();
    const footer = Array.from(fixture.nativeElement.querySelectorAll('footer a')) as HTMLAnchorElement[];
    expect(footer.map(link => link.getAttribute('href'))).toEqual(['/help#about', '/help#contact', '/help#help']);
    expect(fixture.nativeElement.querySelector('.page-wrapper > div a').getAttribute('href')).toBe('/help#contact');
  });
});
