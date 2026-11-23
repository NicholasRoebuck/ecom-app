import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';

@Component({
  selector: 'app-admin-access', standalone: true, imports: [CommonModule, RouterModule],
  template: `
    <main class="admin-page">
      <section class="admin-panel">
        <h1>Owner access</h1>
        <p *ngIf="reason === 'unavailable'; else accessMessage">Owner access could not be verified. Please try again.</p>
        <ng-template #accessMessage>
          <p>{{ reason === 'forbidden' && (auth.isAuthenticated$ | async) ? 'This account does not have access to store administration.' : 'Sign in with the store owner account to continue.' }}</p>
        </ng-template>
        <div class="admin-actions">
          <button *ngIf="reason !== 'unavailable'" type="button" class="admin-button" (click)="login()">
            {{ reason === 'forbidden' && (auth.isAuthenticated$ | async) ? 'Use another account' : 'Sign in' }}
          </button>
          <a *ngIf="reason === 'unavailable'" routerLink="/admin" class="admin-button">Try again</a>
          <a routerLink="/products">Return to store</a>
        </div>
      </section>
    </main>
  `,
  styleUrl: './admin.css'
})
export class AdminAccessComponent {
  readonly reason: string;
  constructor(public auth: AuthService, route: ActivatedRoute) {
    const requested = route.snapshot.queryParamMap.get('reason');
    this.reason = ['sign-in', 'forbidden', 'unavailable'].includes(requested || '') ? requested! : 'sign-in';
  }
  login(): void {
    this.auth.loginWithRedirect({appState: {target: '/admin'}, authorizationParams: {prompt: 'login'}});
  }
}
