import { Component, HostListener } from '@angular/core';
import { Router, Scroll } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'angular-frontend';
  isScrolled = false;

  constructor(private router: Router, private viewportScroller: ViewportScroller) {
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
