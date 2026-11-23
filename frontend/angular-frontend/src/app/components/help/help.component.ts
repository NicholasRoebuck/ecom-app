import { DOCUMENT, CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { focusHelpSection } from './help-navigation';

@Component({selector: 'app-help', standalone: true, imports: [CommonModule, RouterModule],
  templateUrl: './help.component.html', styleUrl: './help.component.css'})
export class HelpComponent implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private frame: number | null = null;
  readonly faqs = ['Ordering & payment', 'Choosing product options', 'Shipping & delivery', 'Returns & cancellations'];

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.frame !== null) this.document.defaultView?.cancelAnimationFrame(this.frame);
    });
  }
  ngAfterViewInit(): void {
    this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(fragment => {
      const window = this.document.defaultView;
      if (!window) return;
      if (this.frame !== null) window.cancelAnimationFrame(this.frame);
      this.frame = window.requestAnimationFrame(() => {
        this.frame = null;
        if (fragment) focusHelpSection(this.document, fragment);
        else {
          const title = this.document.getElementById('help-page-title');
          title?.focus({preventScroll: true});
          window.scrollTo({top: 0, behavior: 'auto'});
        }
      });
    });
  }
  repeatSection(section: string): void {
    if (this.route.snapshot.fragment === section) focusHelpSection(this.document, section);
  }
}
