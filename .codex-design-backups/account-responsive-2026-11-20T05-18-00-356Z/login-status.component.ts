import { OwnerAccessService } from '../../services/owner-access.service';
import { DOCUMENT } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-login-status',
  templateUrl: './login-status.component.html',
  styleUrl: './login-status.component.css'
})
export class LoginStatusComponent {
  isAuthenticated: boolean = false;
  profileJson: string | undefined;
  // userEmail: string | undefined;
  userEmail: string | null;

  storage: Storage = sessionStorage;

  constructor(private auth: AuthService, @Inject(DOCUMENT) private doc: Document, private cartService: CartService, public ownerAccess: OwnerAccessService) { }

  ngOnInit(): void {
    this.auth.isAuthenticated$.subscribe((authenticated: boolean) => {
      this.isAuthenticated = authenticated;
      console.log('User is authenticated: ', this.isAuthenticated);
    });

    this.auth.user$.subscribe((user) => {
      

      // the fix
      if (user?.email) {
        this.userEmail = user?.email;
        this.storage.setItem('userEmail', JSON.stringify(this.userEmail));
        console.log('User ID: ', this.userEmail);
      }

      // this.userEmail = user?.email;
      // this.storage.setItem('userEmail', JSON.stringify(this.userEmail));
      // console.log('User ID: ', this.userEmail);
    });
  }

  login() {
    console.log('LOGIN BUTTON CLICKED');
    this.auth.loginWithRedirect();
  }

  logout(): void {
    this.cartService.clearCart();
    this.storage.removeItem('userEmail');
    this.auth.logout({ logoutParams: { returnTo: this.doc.location.origin } });
  }
}
