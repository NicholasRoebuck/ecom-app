import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { CartService } from '../../services/cart.service';
import { CartStatusComponent } from './cart-status.component';

describe('CartStatusComponent', () => {
  let fixture: ComponentFixture<CartStatusComponent>;
  let quantity: BehaviorSubject<number>;
  beforeEach(async () => {
    quantity = new BehaviorSubject(2);
    await TestBed.configureTestingModule({
      declarations: [CartStatusComponent], imports: [RouterTestingModule],
      providers: [{provide: CartService, useValue: {
        totalPrice: new BehaviorSubject(25), totalQuantity: quantity
      }}]
    }).compileComponents();
    fixture = TestBed.createComponent(CartStatusComponent); fixture.detectChanges();
  });

  it('links to the cart and updates its item count and accessible name', () => {
    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('.cart-link');
    expect(link.getAttribute('href')).toBe('/cart-details');
    expect(link.getAttribute('aria-label')).toBe('Shopping cart, 2 items');
    quantity.next(3); fixture.detectChanges();
    expect(link.getAttribute('aria-label')).toBe('Shopping cart, 3 items');
    expect(link.querySelector('.cart-count').textContent.trim()).toBe('3');
  });

  it('renders the cart shape without an icon font and keeps the icon decorative', () => {
    const icon: SVGElement = fixture.nativeElement.querySelector('svg.cart-icon');
    expect(icon).not.toBeNull(); expect(icon.querySelector('path').getAttribute('d').length).toBeGreaterThan(0);
    expect(icon.getAttribute('aria-hidden')).toBe('true'); expect(icon.getAttribute('focusable')).toBe('false');
    expect(fixture.nativeElement.querySelector('i')).toBeNull();
  });

  for (const width of [375, 768, 1280]) {
    it('keeps the cart visible at ' + width + 'px with the application styles applied', async () => {
      // A real iframe viewport exercises responsive styles regardless of the test runner's window size.
      const frame = document.createElement('iframe');
      frame.style.width = width + 'px'; frame.style.height = '150px';
      const styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]'))
        .map(node => node.outerHTML).join('');
      const loaded = new Promise<void>(resolve => frame.onload = () => resolve());
      frame.srcdoc = '<!doctype html><html><head><base href="' + document.baseURI + '">' + styles +
        '</head><body>' + fixture.nativeElement.outerHTML + '</body></html>';
      document.body.appendChild(frame);
      try {
        await loaded;
        const link = frame.contentDocument.querySelector<HTMLElement>('.cart-link');
        const wrapper = frame.contentDocument.querySelector('.cart-area');
        expect(frame.contentWindow.getComputedStyle(wrapper).display).not.toBe('none');
        expect(link.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
        expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      } finally { frame.remove(); }
    });
  }
});
