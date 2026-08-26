// =====================================================================
// ✅ Unit Tests – auth-api.service.spec.ts
// تغطية: resendConfirmationEmail (B-15 في RELEASE-BLOCKERS-AR.md) — أول اختبار
// لهذا الصف على الإطلاق.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';

describe('AuthApiService.resendConfirmationEmail', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ يستدعي POST /auth/email/resend-confirmation بالبريد بعد تطبيعه', () => {
    service.resendConfirmationEmail('  Someone@Example.com  ').subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/email/resend-confirmation`);

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'someone@example.com' });

    req.flush({ message: 'إذا كان البريد مسجّلاً وغير مؤكَّد، فقد أُرسل إليه رابط تأكيد جديد.' });
  });

  it('✅ يُعيد نصّ الخادم كما هو دون أي تخصيص — شرط مقاومة التعداد', done => {
    const serverMessage = 'إذا كان البريد مسجّلاً وغير مؤكَّد، فقد أُرسل إليه رابط تأكيد جديد.';

    service.resendConfirmationEmail('someone@example.com').subscribe(result => {
      expect(result.message).toBe(serverMessage);
      done();
    });

    httpMock.expectOne(`${environment.apiBaseUrl}/auth/email/resend-confirmation`)
      .flush({ message: serverMessage });
  });
});
