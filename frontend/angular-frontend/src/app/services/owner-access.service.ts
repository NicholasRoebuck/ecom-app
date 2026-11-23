import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, combineLatest, distinctUntilChanged, map, Observable, of, shareReplay, startWith, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({providedIn: 'root'})
export class OwnerAccessService {
  readonly isOwner$: Observable<boolean>;

  constructor(private http: HttpClient, auth: AuthService) {
    this.isOwner$ = combineLatest([auth.isLoading$, auth.isAuthenticated$, auth.user$]).pipe(
      map(([loading, authenticated, user]) => ({loading, authenticated, subject: user?.sub})),
      distinctUntilChanged((left, right) => left.loading === right.loading &&
        left.authenticated === right.authenticated && left.subject === right.subject),
      switchMap(state => state.loading || !state.authenticated ? of(false) :
        this.verify().pipe(catchError(() => of(false)), startWith(false))),
      shareReplay({bufferSize: 1, refCount: true})
    );
  }

  verify(): Observable<boolean> {
    return this.http.get<{access: string}>(environment['premearAppApiUrl'] + '/admin/access')
      .pipe(map(response => response.access === 'owner'));
  }
}
