// =====================================================================
// âœ… Unit Tests â€“ auth-guard.spec.ts
// ØªØºØ·ÙŠØ©: Ø§Ù„Ø³Ù…Ø§Ø­ Ø¨Ø§Ù„ÙˆØµÙˆÙ„ØŒ Ø§Ù„Ø±ÙØ¶ØŒ ÙˆØ­Ø§Ù„Ø§Øª edge cases
// =====================================================================
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthGuard } from './auth-guard';
import { AuthService } from './auth.service';
import { TokenStorageService } from '../core/services/token-storage.service';

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

  it('âœ… ÙŠØ³Ù…Ø­ Ø¨Ø§Ù„ÙˆØµÙˆÙ„ Ø¥Ø°Ø§ ÙƒØ§Ù† Ø§Ù„ØªÙˆÙƒÙ† Ù…ÙˆØ¬ÙˆØ¯Ø§Ù‹ ÙˆØµØ§Ù„Ø­Ø§Ù‹', () => {
    authServiceSpy.getAccessToken.and.returnValue('valid-jwt-token');
    authServiceSpy.validateSession.and.stub();

    const result = TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/profile' } as any)
    );

    expect(result).toBeTrue();
  });

  it('âœ… ÙŠÙØ¹ÙŠØ¯ UrlTree Ù„ØµÙØ­Ø© ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¯Ø®ÙˆÙ„ Ø¥Ø°Ø§ Ù„Ù… ÙŠÙˆØ¬Ø¯ ØªÙˆÙƒÙ†', () => {
    authServiceSpy.getAccessToken.and.returnValue(null);
    authServiceSpy.validateSession.and.stub();

    const result = TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/profile' } as any)
    );

    expect(result).toBeInstanceOf(UrlTree);
    const urlTree = result as UrlTree;
    expect(urlTree.toString()).toContain('/auth/login');
  });

  it('âœ… ÙŠØ­ÙØ¸ returnUrl ÙÙŠ query params', () => {
    authServiceSpy.getAccessToken.and.returnValue(null);
    authServiceSpy.validateSession.and.stub();

    const result = TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/meine-anzeigen' } as any)
    );

    expect(result).toBeInstanceOf(UrlTree);
    const urlTree = result as UrlTree;
    expect(urlTree.queryParams['returnUrl']).toBe('/meine-anzeigen');
  });

  it('âœ… ÙŠØ³ØªØ¯Ø¹ÙŠ validateSession Ù‚Ø¨Ù„ Ø§Ù„ØªØ­Ù‚Ù‚', () => {
    authServiceSpy.getAccessToken.and.returnValue('token');
    authServiceSpy.validateSession.and.stub();

    TestBed.runInInjectionContext(() =>
      AuthGuard({} as any, { url: '/' } as any)
    );

    expect(authServiceSpy.validateSession).toHaveBeenCalled();
  });
});
