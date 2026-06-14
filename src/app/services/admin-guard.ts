import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from './auth.service';

export const AdminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  auth.restoreSession();

  if (!auth.getAccessToken()) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: {
        returnUrl: state.url
      }
    });
  }

  return auth.isAdmin$.pipe(
    map(isAdmin => {
      if (isAdmin) {
        return true;
      }

      return router.createUrlTree(['/not-authorized']);
    })
  );
};