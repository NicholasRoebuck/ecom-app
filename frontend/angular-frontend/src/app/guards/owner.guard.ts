import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, filter, map, of, switchMap, take } from 'rxjs';
import { OwnerAccessService } from '../services/owner-access.service';

export const ownerGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const access = inject(OwnerAccessService);
  const router = inject(Router);
  const denied = (reason: string) => router.createUrlTree(['/admin-access'], {queryParams: {reason}});
  return auth.isLoading$.pipe(filter(loading => !loading), take(1),
    switchMap(() => auth.isAuthenticated$.pipe(take(1))),
    switchMap(authenticated => authenticated
      ? access.verify().pipe(
          map(owner => owner ? true : denied('forbidden')),
          catchError(error => of(denied(error.status === 401 || ['login_required', 'consent_required', 'interaction_required'].includes(error.error) ? 'sign-in' : error.status === 403 ? 'forbidden' : 'unavailable'))))
      : of(denied('sign-in')))
  );
};
