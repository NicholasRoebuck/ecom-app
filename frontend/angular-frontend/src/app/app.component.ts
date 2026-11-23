import { environment } from '../environments/environment';
import { STORE_DEPARTMENTS } from './common/store-departments';
import { DOCUMENT } from '@angular/common';
import { focusHelpSection } from './components/help/help-navigation';
import { Component, HostListener, inject } from '@angular/core';
import { PendingCheckoutService } from './services/pending-checkout.service';
import { Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly isPreview = !!environment['preview'];
  readonly storeDepartments = STORE_DEPARTMENTS;
  private readonly document = inject(DOCUMENT);
  title = 'angular-frontend';
  isScrolled = false;

  constructor(private router: Router, private viewportScroller: ViewportScroller, pendingCheckout: PendingCheckoutService) {
    pendingCheckout.start();
    this.viewportScroller.setHistoryScrollRestoration('manual');
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (!(event instanceof Scroll)) return;
      if (event.position) {
        this.viewportScroller.scrollToPosition(event.position);
      } else if (this.router.lastSuccessfulNavigation?.extras.state?.['scrollToTop']) {
        this.viewportScroller.scrollToPosition([0, 0]);
      }
    });
  }

  onHelpLinkClick(section: string): void {
    if (this.router.url === '/help#' + section) focusHelpSection(this.document, section);
  }

  get isHelpPage(): boolean {
    return this.router.isActive('/help', {
      paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored'
    });
  }

  get isHomePage(): boolean {
    return this.router.isActive('/home', {
      paths: 'exact', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored'
    });
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const isScrolled = window.scrollY > 6;
    if (this.isScrolled !== isScrolled) {
      this.isScrolled = isScrolled;
    }
  }
}
