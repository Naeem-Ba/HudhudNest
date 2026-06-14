import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, finalize, switchMap, throwError } from 'rxjs';
import { AuthApiService } from '../services/auth-api.service';
import { TokenStorageService } from '../services/token-storage.service';

let refreshInProgress = false;

function isAuthEndpoint(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/phone/send-otp') ||
    url.includes('/auth/phone/verify') ||
    url.includes('/auth/forgot-password') ||
    url.includes('/auth/reset-password')
  );
}

export const RefreshAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  const authApi = inject(AuthApiService);
  const router = inject(Router);

  const accessToken = tokenStorage.getAccessToken();

  const authReq = accessToken
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${accessToken}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      const shouldTryRefresh =
        error.status === 401 &&
        !isAuthEndpoint(req.url) &&
        !refreshInProgress &&
        !!tokenStorage.getRefreshToken();

      if (!shouldTryRefresh) {
        if (error.status === 401 && !isAuthEndpoint(req.url)) {
          tokenStorage.clear();
          void router.navigateByUrl('/auth/login');
        }

        return throwError(() => error);
      }

      refreshInProgress = true;

      return authApi.refreshToken().pipe(
        switchMap(response => {
          const newAccessToken = response.accessToken;

          if (!newAccessToken) {
            tokenStorage.clear();
            void router.navigateByUrl('/auth/login');
            return throwError(() => error);
          }

          const retryReq = req.clone({
            setHeaders: {
              Authorization: `Bearer ${newAccessToken}`
            }
          });

          return next(retryReq);
        }),
        catchError(refreshError => {
          tokenStorage.clear();
          void router.navigateByUrl('/auth/login');
          return throwError(() => refreshError);
        }),
        finalize(() => {
          refreshInProgress = false;
        })
      );
    })
  );
};
