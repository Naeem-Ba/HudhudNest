import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ServiceProviderService } from '../api/service-provider.service';

/**
 * يحمي مسارات /provider/* — يتطلب حساباً مسجَّل دخوله *و* لديه ملف ServiceProvider فعلي
 * (GET /ServiceProviders/me يُعيد 204 لغير المزوّدين، وليس دور Identity كـ AdminGuard).
 * "ليس مزوّد خدمة" ليس خطأ صلاحيات (لا نوجّه إلى /not-authorized) — هو ببساطة حساب لم
 * ينضم بعد، فنعيده إلى صفحة "طلباتي" حيث تظهر بطاقة "هل تقدّم خدمة عقارية؟" (become-provider
 * banner) ليتقدّم بطلب الانضمام من هناك.
 */
export const ProviderGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const providerApi = inject(ServiceProviderService);
  const router = inject(Router);

  auth.restoreSession();

  if (!auth.getAccessToken()) {
    return router.createUrlTree(['/auth/login'], {
      queryParams: {
        returnUrl: state.url
      }
    });
  }

  return providerApi.getMine().pipe(
    map((provider): true | UrlTree => (provider ? true : router.createUrlTree(['/my-services']))),
    catchError(() => of(router.createUrlTree(['/my-services'])))
  );
};
