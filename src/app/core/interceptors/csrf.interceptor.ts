import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { CsrfTokenService } from '../services/csrf-token.service';
import { isBackendApiRequest } from './refresh-auth.interceptor';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * RELEASE-BLOCKERS-AR.md B-20: attaches X-XSRF-TOKEN (from CsrfTokenService's in-memory
 * cache) to every unsafe request against our API, so the backend's
 * CookieCsrfProtectionMiddleware sees the header it requires whenever the ambient
 * refresh_token cookie is present — this is what makes POST /auth/logout (which goes
 * through the normal interceptor chain) work correctly.
 *
 * The two call sites that deliberately bypass this whole chain
 * (requestNewAccessToken in refresh-auth.interceptor.ts, restoreSession in app.config.ts)
 * do NOT go through this interceptor and must attach the header themselves — see the
 * comments there.
 */
export const CsrfInterceptor: HttpInterceptorFn = (req, next) => {
  const csrfTokenService = inject(CsrfTokenService);

  const isApiRequest = isBackendApiRequest(req.url);
  const isUnsafeMethod = UNSAFE_METHODS.has(req.method.toUpperCase());
  const token = csrfTokenService.getToken();

  const request =
    isApiRequest && isUnsafeMethod && token && !req.headers.has('X-XSRF-TOKEN')
      ? req.clone({ setHeaders: { 'X-XSRF-TOKEN': token } })
      : req;

  return next(request);
};
