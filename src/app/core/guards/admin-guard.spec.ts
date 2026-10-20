// =====================================================================
// ✅ Unit Tests – admin-guard.spec.ts
// تغطية: بلا توكن، توكن بلا صلاحية أدمن، توكن بصلاحية أدمن
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { AdminGuard } from './admin-guard';
import { AuthService } from '../auth/auth.service';

describe('AdminGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;

  function setupWithIsAdmin(isAdmin: boolean, accessToken: string | null): void {
    const spy = jasmine.createSpyObj('AuthService', ['restoreSession', 'getAccessToken'], {
      isAdmin$: of(isAdmin)
    });
    spy.getAccessToken.and.returnValue(accessToken);

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: spy }]
    });

    authServiceSpy = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
  }

  it('يعيد UrlTree لصفحة تسجيل الدخول إذا لم يوجد توكن', () => {
    setupWithIsAdmin(false, null);

    const result = TestBed.runInInjectionContext(() =>
      AdminGuard({} as any, { url: '/admin' } as any)
    );

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/auth/login');
    expect(authServiceSpy.restoreSession).toHaveBeenCalled();
  });

  it('يحفظ returnUrl عند غياب التوكن', () => {
    setupWithIsAdmin(false, null);

    const result = TestBed.runInInjectionContext(() =>
      AdminGuard({} as any, { url: '/admin/users' } as any)
    );

    expect((result as UrlTree).queryParams['returnUrl']).toBe('/admin/users');
  });

  it('يعيد UrlTree لـ /not-authorized إذا كان التوكن موجوداً لكن المستخدم ليس أدمن', async () => {
    setupWithIsAdmin(false, 'valid-jwt-token');

    const outcome = TestBed.runInInjectionContext(() =>
      AdminGuard({} as any, { url: '/admin' } as any)
    );
    const result = isObservable(outcome) ? await firstValueFrom(outcome) : outcome;

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/not-authorized');
  });

  it('يسمح بالوصول إذا كان التوكن موجوداً والمستخدم أدمن', async () => {
    setupWithIsAdmin(true, 'valid-jwt-token');

    const outcome = TestBed.runInInjectionContext(() =>
      AdminGuard({} as any, { url: '/admin' } as any)
    );
    const result = isObservable(outcome) ? await firstValueFrom(outcome) : outcome;

    expect(result).toBeTrue();
  });
});
