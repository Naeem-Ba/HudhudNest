// =====================================================================
// ✅ Unit Tests – auth-guard.spec.ts
// تغطية: السماح بالوصول، الرفض، وحالات edge cases
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthGuard } from './auth-guard';
import { AuthService } from '../auth/auth.service';
import { TokenStorageService } from '../services/token-storage.service';

describe('AuthGuard', () => {
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('AuthService', [
      'validateSession',
      'getAccessToken',
      'restoreSession'
    ]);

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: spy },
        {
          provide: TokenStorageService,
          useValue: { getAccessToken: () => null, clear: () => {} }
        }
      ]
    });

    authServiceSpy = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    router         = TestBed.inject(Router);
  });

  it('✅ يسمح بالوصول إذا كان التوكن موجوداً وصالحاً', () => {
    authServiceSpy.getAccessToken.and.returnValue('valid-jwt-token');
    authServiceSpy.validateSession.and.stub();

    const result = TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/profile' } as any)
    );

    expect(result).toBeTrue();
  });

  it('✅ يعيد UrlTree لصفحة تسجيل الدخول إذا لم يوجد توكن', () => {
    authServiceSpy.getAccessToken.and.returnValue(null);
    authServiceSpy.validateSession.and.stub();

    const result = TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/profile' } as any)
    );

    expect(result).toBeInstanceOf(UrlTree);
    const urlTree = result as UrlTree;
    expect(urlTree.toString()).toContain('/auth/login');
  });

  it('✅ يحفظ returnUrl في query params', () => {
    authServiceSpy.getAccessToken.and.returnValue(null);
    authServiceSpy.validateSession.and.stub();

    const result = TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/meine-anzeigen' } as any)
    );

    expect(result).toBeInstanceOf(UrlTree);
    const urlTree = result as UrlTree;
    expect(urlTree.queryParams['returnUrl']).toBe('/meine-anzeigen');
  });

  it('✅ يستدعي validateSession قبل التحقق', () => {
    authServiceSpy.getAccessToken.and.returnValue('token');
    authServiceSpy.validateSession.and.stub();

    TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/' } as any)
    );

    expect(authServiceSpy.validateSession).toHaveBeenCalled();
  });
});
