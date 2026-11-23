import { Injector } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthGuard } from '@auth0/auth0-angular';
import { adminChangesGuard } from './guards/admin-changes.guard';
import { ownerGuard } from './guards/owner.guard';
import { CartDetailsComponent } from './components/cart-details/cart-details.component';
import { ProductDetailsComponent } from './components/product-details/product-details.component';
import { ProductListComponent } from './components/product-list/product-list.component';
import { HomeComponent } from './components/home/home.component';

function sendToLoginPage(auth: AuthGuard, injector: Injector){
  // use injector to access any service within your application
  const router = injector.get(Router);

  // redirect the user to your custom login page
  router.navigate(['/login-status']);
}

export const appRoutes: Routes = [
  {path: 'help', loadComponent: () => import('./components/help/help.component').then(module => module.HelpComponent)},
  {path: 'admin-access', loadComponent: () => import('./components/admin/admin-access.component').then(module => module.AdminAccessComponent)},
  {path: 'admin', canDeactivate: [adminChangesGuard], canActivate: [ownerGuard], loadComponent: () => import('./components/admin/admin.component').then(module => module.AdminComponent)},
  {path: 'order-history', loadComponent: () => import('./components/order-history/order-history.component').then(module => module.OrderHistoryComponent), canActivate: [AuthGuard], data: {onAuthRequired: sendToLoginPage}},
  {path: 'members', loadComponent: () => import('./components/members-page/members-page.component').then(module => module.MembersPageComponent), canActivate: [AuthGuard], data: {onAuthRequired: sendToLoginPage}},
  {path: 'checkout', loadComponent: () => import('./components/checkout/checkout.component').then(module => module.CheckoutComponent)},
  {path: 'cart-details', component: CartDetailsComponent},
  {path: 'products/:id', component: ProductDetailsComponent},
  {path: 'search/:keyword', component: ProductListComponent},
  {path: 'category/:id', component: ProductListComponent},
  {path: 'category', component: ProductListComponent},
  {path: 'products', component: ProductListComponent},
  {path: 'home', component: HomeComponent},
  {path: '', redirectTo:'/home', pathMatch:'full'},
  {path: '**', redirectTo:'/products', pathMatch:'full'}
]

