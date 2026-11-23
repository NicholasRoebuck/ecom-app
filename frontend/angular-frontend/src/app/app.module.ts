import { appRoutes } from './app.routes';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { ProductListComponent } from './components/product-list/product-list.component';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { ProductService } from './services/product.service';
import { RouterModule } from '@angular/router';
import { ProductCategoryMenuComponent } from './components/product-category-menu/product-category-menu.component';
import { SearchComponent } from './components/search/search.component';
import { ProductDetailsComponent } from './components/product-details/product-details.component';

import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { CartStatusComponent } from './components/cart-status/cart-status.component';
import { CartDetailsComponent } from './components/cart-details/cart-details.component';
import { LoginStatusComponent } from './components/login-status/login-status.component';
import { AuthModule } from '@auth0/auth0-angular';
import myAppConfig from './config/my-app-config';
import { AuthInterceptorService } from './services/auth-interceptor.service';
import { HomeComponent } from './components/home/home.component';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';



@NgModule({
  declarations: [
    AppComponent,
    ProductListComponent,
    ProductCategoryMenuComponent,
    SearchComponent,
    ProductDetailsComponent,
    CartStatusComponent,
    CartDetailsComponent,
    LoginStatusComponent,
    HomeComponent,
  ],
  imports: [
    RouterModule.forRoot(appRoutes, { scrollPositionRestoration: 'disabled' }),
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    NgbModule,
    AuthModule.forRoot({
      ...myAppConfig.auth,
      // cacheLocation: 'localstorage',
      httpInterceptor: {
        ...myAppConfig.httpInterceptor,
      },
    })
  ],
  providers: [ProductService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptorService,
      multi: true,
    },
    provideAnimationsAsync(),
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
