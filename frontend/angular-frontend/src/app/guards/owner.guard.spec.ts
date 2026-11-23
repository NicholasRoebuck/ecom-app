import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { OwnerAccessService } from '../services/owner-access.service';
import { ownerGuard } from './owner.guard';

describe('Owner route guard', () => {
  let auth: any;
  let access: jasmine.SpyObj<OwnerAccessService>;
  let router: Router;
  function decision(): boolean | UrlTree | undefined {
    let result: boolean | UrlTree | undefined;
    const response = TestBed.runInInjectionContext(() => ownerGuard({} as any, {} as any)) as Observable<boolean | UrlTree>;
    response.subscribe(value => result = value);
    return result;
  }
  beforeEach(() => {
    auth = {isLoading$: of(false), isAuthenticated$: of(true)};
    access = jasmine.createSpyObj('OwnerAccessService', ['verify']);
    access.verify.and.returnValue(of(true));
    TestBed.configureTestingModule({imports: [RouterTestingModule], providers: [
      {provide: AuthService, useValue: auth}, {provide: OwnerAccessService, useValue: access}
    ]});
    router = TestBed.inject(Router);
  });

  it('requires fresh backend authorization on every entry', () => {
    expect(decision()).toBeTrue();
    expect(decision()).toBeTrue();
    expect(access.verify).toHaveBeenCalledTimes(2);
  });
  it('does not request a token for anonymous navigation', () => {
    auth.isAuthenticated$ = of(false);
    expect(router.serializeUrl(decision() as UrlTree)).toBe('/admin-access?reason=sign-in');
    expect(access.verify).not.toHaveBeenCalled();
  });
  it('waits for identity initialization', () => {
    const loading = new BehaviorSubject(true);
    auth.isLoading$ = loading;
    expect(decision()).toBeUndefined();
    expect(access.verify).not.toHaveBeenCalled();
    loading.next(false);
    expect(access.verify).toHaveBeenCalledTimes(1);
  });
  it('redirects customers and treats an outage as unverified access', () => {
    access.verify.and.returnValue(throwError(() => ({status: 403})));
    expect(router.serializeUrl(decision() as UrlTree)).toBe('/admin-access?reason=forbidden');
    access.verify.and.returnValue(throwError(() => ({status: 503})));
    expect(router.serializeUrl(decision() as UrlTree)).toBe('/admin-access?reason=unavailable');
  });

  it('sends expired login sessions back to sign-in instead of treating them as an outage', () => {
    for (const error of [{status: 401}, {error: 'login_required'}, {error: 'interaction_required'}]) {
      access.verify.and.returnValue(throwError(() => error));
      expect(router.serializeUrl(decision() as UrlTree)).toBe('/admin-access?reason=sign-in');
    }
  });
});
