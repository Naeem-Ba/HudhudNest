// =====================================================================
// ✅ Unit Tests – provider-guard.spec.ts
// تغطية: بلا توكن، حساب ليس مزوّد خدمة، حساب مزوّد خدمة، فشل الطلب
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { firstValueFrom, isObservable, of, throwError } from 'rxjs';
import { ProviderGuard } from './provider-guard';
import { AuthService } from '../auth/auth.service';
import { ServiceProviderService } from '../api/service-provider.service';

describe('ProviderGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let providerApiSpy: jasmine.SpyObj<ServiceProviderService>;

  function setup(accessToken: string | null): void {
    authServiceSpy = jasmine.createSpyObj('AuthService', ['restoreSession', 'getAccessToken']);
    authServiceSpy.getAccessToken.and.returnValue(accessToken);

    providerApiSpy = jasmine.createSpyObj('ServiceProviderService', ['getMine']);

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ServiceProviderService, useValue: providerApiSpy }
      ]
    });
  }

  async function run(url = '/provider/dashboard'): Promise<any> {
    const outcome: any = TestBed.runInInjectionContext(() => ProviderGuard({} as any, { url } as any));
    return isObservable(outcome) ? firstValueFrom(outcome) : outcome;
  }

  it('يعيد UrlTree لصفحة تسجيل الدخول إذا لم يوجد توكن، ويحفظ returnUrl', async () => {
    setup(null);

    const result = await run('/provider/dashboard');

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/auth/login');
    expect((result as UrlTree).queryParams['returnUrl']).toBe('/provider/dashboard');
    expect(authServiceSpy.restoreSession).toHaveBeenCalled();
    expect(providerApiSpy.getMine).not.toHaveBeenCalled();
  });

  it('يوجّه إلى /my-services (وليس /not-authorized) عندما لا يملك الحساب ملف مزوّد خدمة', async () => {
    setup('valid-jwt-token');
    providerApiSpy.getMine.and.returnValue(of(null));

    const result = await run();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/my-services');
    expect((result as UrlTree).toString()).not.toContain('/not-authorized');
  });

  it('يسمح بالوصول عندما يملك الحساب ملف مزوّد خدمة فعلياً', async () => {
    setup('valid-jwt-token');
    providerApiSpy.getMine.and.returnValue(of({ id: 'p1' } as any));

    const result = await run();

    expect(result).toBeTrue();
  });

  it('يوجّه إلى /my-services عند فشل طلب التحقق (fail-safe)، بدل كسر التنقّل', async () => {
    setup('valid-jwt-token');
    providerApiSpy.getMine.and.returnValue(throwError(() => new Error('network down')));

    const result = await run();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toContain('/my-services');
  });
});
