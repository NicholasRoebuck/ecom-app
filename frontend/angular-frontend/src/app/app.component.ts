import { Component, HostListener } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'angular-frontend';
  isScrolled = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    const isScrolled = window.scrollY > 6;
    if (this.isScrolled !== isScrolled) {
      this.isScrolled = isScrolled;
    }
  }
}
