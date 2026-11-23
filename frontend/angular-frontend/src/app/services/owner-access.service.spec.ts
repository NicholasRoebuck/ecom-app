import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject } from 'rxjs';
import { OwnerAccessService } from './owner-access.service';
import { environment } from '../../environments/environment';

describe('OwnerAccessService backend authority', () => {
  let service: OwnerAccessService;
  let http: HttpTestingController;
  let authenticated: BehaviorSubject<boolean>;
  let user: BehaviorSubject<any>;
  const url = environment['premearAppApiUrl'] + '/admin/access';
  beforeEach(() => {
    authenticated = new BehaviorSubject(true);
    user = new BehaviorSubject({sub: 'owner-subject'});
    TestBed.configureTestingModule({imports: [HttpClientTestingModule], providers: [
      {provide: AuthService, useValue: {isLoading$: new BehaviorSubject(false), isAuthenticated$: authenticated, user$: user}}
    ]});
    service = TestBed.inject(OwnerAccessService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shows owner access only after the backend confirms it and clears it on logout', () => {
    const values: boolean[] = [];
    const sub = service.isOwner$.subscribe(value => values.push(value));
    expect(values[values.length - 1]).toBeFalse();
    http.expectOne(url).flush({access: 'owner'});
    expect(values[values.length - 1]).toBeTrue();
    authenticated.next(false);
    expect(values[values.length - 1]).toBeFalse();
    sub.unsubscribe();
  });

  it('hides owner navigation for customers and unavailable verification', () => {
    const values: boolean[] = [];
    const sub = service.isOwner$.subscribe(value => values.push(value));
    http.expectOne(url).flush({}, {status: 403, statusText: 'Forbidden'});
    expect(values[values.length - 1]).toBeFalse();
    user.next({sub: 'another-account'});
    http.expectOne(url).flush({}, {status: 503, statusText: 'Unavailable'});
    expect(values[values.length - 1]).toBeFalse();
    sub.unsubscribe();
  });

  it('cancels a stale owner check when the account changes', () => {
    const values: boolean[] = [];
    const sub = service.isOwner$.subscribe(value => values.push(value));
    const old = http.expectOne(url);
    user.next({sub: 'customer'});
    expect(old.cancelled).toBeTrue();
    http.expectOne(url).flush({}, {status: 403, statusText: 'Forbidden'});
    expect(values[values.length - 1]).toBeFalse();
    sub.unsubscribe();
  });

  it('does not call protected APIs for signed-out users', () => {
    authenticated.next(false);
    const sub = service.isOwner$.subscribe(value => expect(value).toBeFalse());
    http.expectNone(url);
    sub.unsubscribe();
  });

  it('always makes a fresh request for route verification', () => {
    service.verify().subscribe(value => expect(value).toBeTrue());
    http.expectOne(url).flush({access: 'owner'});
    service.verify().subscribe(value => expect(value).toBeFalse());
    http.expectOne(url).flush({access: 'customer'});
  });
});
