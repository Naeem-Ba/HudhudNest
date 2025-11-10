import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { map } from 'rxjs/operators';

export const AuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isLoggedIn$.pipe(
    map(isLoggedIn => {
      if (!isLoggedIn && !authService.isLoggedIn()) {
        alert('Bitte melde dich zuerst an!');
        router.navigate(['/login']);
        return false;
      }
      return true;
    })
  );
};
