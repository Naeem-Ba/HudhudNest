import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { map } from 'rxjs/operators';

export const AuthGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isLoggedIn$.pipe(
    map(isLogged => {
      if (isLogged) return true; // إذا سجل الدخول، اسمح بالوصول

      router.navigate(['/login']); // وإلا، قم بالتوجيه إلى /login
      console.log('AuthGuard is blocking navigation.')
      return false; //  وامنعه من الوصول
    })
  );
};
