import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness, RouterTestingModule } from '@angular/router/testing';
import { HelpComponent } from './help.component';
import { focusHelpSection } from './help-navigation';

describe('Help & About page navigation', () => {
  beforeEach(() => TestBed.configureTestingModule({imports: [RouterTestingModule.withRoutes([
    {path: 'help', loadComponent: () => Promise.resolve(HelpComponent)}
  ])]}));
  async function settled(harness: RouterTestingHarness): Promise<void> {
    await harness.fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  it('renders all sections with explicitly unfinished business details', async () => {
    const harness = await RouterTestingHarness.create('/help'); await settled(harness);
    const page = harness.routeNativeElement;
    for (const id of ['about', 'contact', 'help']) expect(page.querySelector('#' + id)).not.toBeNull();
    expect(page.querySelector('.placeholder-note').textContent).toContain('placeholder');
    expect(page.textContent).toContain('Email address to be added.');
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelectorAll('details').length).toBe(4);
  });
  it('opens a direct contact fragment after lazy rendering and focuses its heading', async () => {
    const harness = await RouterTestingHarness.create('/help#contact'); await settled(harness);
    const heading = harness.routeNativeElement.querySelector('#contact');
    expect(document.activeElement).toBe(heading);
    expect((heading as HTMLElement).style.scrollMarginTop).not.toBe('');
  });
  it('moves focus when changing sections within the page', async () => {
    const harness = await RouterTestingHarness.create('/help#about'); await settled(harness);
    await harness.navigateByUrl('/help#help'); await settled(harness);
    expect(document.activeElement).toBe(harness.routeNativeElement.querySelector('#help'));
  });
  it('returns to the same section when its link is clicked again', async () => {
    const harness = await RouterTestingHarness.create('/help#about'); await settled(harness);
    const heading = harness.routeNativeElement.querySelector<HTMLElement>('#about');
    const scroll = spyOn(heading, 'scrollIntoView');
    harness.routeNativeElement.querySelector<HTMLAnchorElement>('a[href="/help#about"]').click();
    expect(scroll).toHaveBeenCalled();
    expect(document.activeElement).toBe(heading);
    await settled(harness);
  });
  it('keeps FAQ content accessible with native disclosure controls', async () => {
    const harness = await RouterTestingHarness.create('/help#help'); await settled(harness);
    const disclosure = harness.routeNativeElement.querySelector('details');
    expect(disclosure.querySelector('summary').textContent).toContain('Ordering');
    expect(disclosure.querySelector('p').textContent).toContain('Details to be added.');
  });
});

describe('Help heading positioning', () => {
  it('uses the current sticky navbar height when positioning and focusing a section', () => {
    const navbar = document.createElement('nav'); navbar.className = 'site-navbar';
    const heading = document.createElement('h2'); heading.id = 'contact'; heading.tabIndex = -1;
    document.body.append(navbar, heading);
    spyOn(navbar, 'getBoundingClientRect').and.returnValue({height: 180} as DOMRect);
    const scroll = spyOn(heading, 'scrollIntoView');
    try {
      focusHelpSection(document, 'contact');
      expect(heading.style.scrollMarginTop).toBe('200px');
      expect(document.activeElement).toBe(heading);
      expect(scroll).toHaveBeenCalledWith({block: 'start', behavior: 'auto'});
    } finally { navbar.remove(); heading.remove(); }
  });
});
