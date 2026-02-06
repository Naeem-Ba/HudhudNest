import { HttpInterceptorFn } from '@angular/common/http';

export const AuthInterceptor: HttpInterceptorFn = (req, next) => {

  // ❌ لا ترسل التوكن للملفات أو auth endpoints
  if (
    req.url.endsWith('/login') ||
    req.url.includes('/register') ||
    req.url.includes('/assets/')
  ) {
    return next(req);
  }

  const token = localStorage.getItem('token');

  // إذا وجد التوكن، قم بإضافته
  if (token && token !== 'undefined') {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  return next(req);
};
