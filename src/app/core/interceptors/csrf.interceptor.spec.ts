// =====================================================================
// ✅ Unit Tests – csrf.interceptor.spec.ts
// تغطية: RELEASE-BLOCKERS-AR.md B-20 — إرفاق X-XSRF-TOKEN على الطلبات غير
// الآمنة فقط، ولمسارات الـ API فقط، وفقط عند وجود توكن مخزَّن.
// =====================================================================
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { CsrfTokenService } from '../services/csrf-token.service';
import { CsrfInterceptor } from './csrf.interceptor';

describe('CsrfInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let csrfTokenService: CsrfTokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([CsrfInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    csrfTokenService = TestBed.inject(CsrfTokenService);
  });

  afterEach(() => httpMock.verify());

  it('✅ يُرفق X-XSRF-TOKEN على POST تجاه الـ API عندما يوجد توكن مخزَّن', () => {
    (csrfTokenService as unknown as { token: string | null }).token = 'cached-token';

    http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.headers.get('X-XSRF-TOKEN')).toBe('cached-token');
    req.flush({});
  });

  it('✅ لا يُرفق أي رأس على GET حتى لو وُجد توكن مخزَّن (طريقة آمنة)', () => {
    (csrfTokenService as unknown as { token: string | null }).token = 'cached-token';

    http.get(`${environment.apiUrl}/listings/1`).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/listings/1`);
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
    req.flush({});
  });

  it('✅ لا يُرفق أي رأس عندما لا يوجد توكن مخزَّن', () => {
    http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
    req.flush({});
  });

  it('✅ لا يُرفق أي رأس على طلب خارج الـ API (مثل i18n) حتى مع وجود توكن', () => {
    (csrfTokenService as unknown as { token: string | null }).token = 'cached-token';

    http.post('/i18n/ar.json', {}).subscribe();

    const req = httpMock.expectOne('/i18n/ar.json');
    expect(req.request.headers.has('X-XSRF-TOKEN')).toBeFalse();
    req.flush({});
  });
});
