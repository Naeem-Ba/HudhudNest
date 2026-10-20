// =====================================================================
// ✅ Unit Tests – csrf-token.service.spec.ts
// تغطية: RELEASE-BLOCKERS-AR.md B-20 — fetchToken()/getToken()/clear().
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { CsrfTokenService } from './csrf-token.service';

describe('CsrfTokenService', () => {
  let service: CsrfTokenService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(CsrfTokenService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ لا يوجد توكن قبل أي استدعاء لـ fetchToken()', () => {
    expect(service.getToken()).toBeNull();
  });

  it('✅ fetchToken() يقرأ csrfToken من جسم الاستجابة ويخزّنه', done => {
    service.fetchToken().subscribe(() => {
      expect(service.getToken()).toBe('token-value-123');
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/security/csrf-token`);
    expect(req.request.method).toBe('GET');
    expect(req.request.withCredentials).toBeTrue();
    req.flush({ csrfToken: 'token-value-123' });
  });

  it('✅ فشل الجلب (خطأ شبكة) لا يرمي — يُفرغ التوكن ويكمل بهدوء', done => {
    service.fetchToken().subscribe(() => {
      expect(service.getToken()).toBeNull();
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/security/csrf-token`);
    req.error(new ProgressEvent('network error'));
  });

  it('✅ clear() يمسح التوكن المخزَّن', done => {
    service.fetchToken().subscribe(() => {
      expect(service.getToken()).toBe('abc');
      service.clear();
      expect(service.getToken()).toBeNull();
      done();
    });

    httpMock.expectOne(`${environment.apiUrl}/security/csrf-token`).flush({ csrfToken: 'abc' });
  });
});
