import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenStorageService } from '../services/token-storage.service';

function isAuthEndpoint(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('/auth/login') ||
    lower.includes('/auth/register') ||
    lower.includes('/auth/refresh') ||
    lower.includes('/auth/phone/send-otp') ||
    lower.includes('/auth/phone/verify') ||
    lower.includes('/auth/forgot-password') ||
    lower.includes('/auth/reset-password')
  );
}

export const RefreshAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  const router = inject(Router);

  const accessToken = tokenStorage.getAccessToken();
  const authReq = accessToken && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthEndpoint(req.url)) {
        tokenStorage.clear();
        void router.navigateByUrl('/auth/login');
      }

      return throwError(() => error);
    })
  );
};