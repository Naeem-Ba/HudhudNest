// =====================================================================
// ✅ Unit Tests – 403 PHONE_REVERIFICATION_REQUIRED
// A phone-restricted account gets this 403 on every unsafe request once the API enforces
// re-verification. Before, nothing in the app handled it (the re-verification page had no
// entry point), so the person just saw failing actions. The interceptor now explains it and
// sends them to /profile/phone-reverify.
// =====================================================================
import { Component } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/services/toast.service';
import { ApiErrorInterceptor } from './api-error.interceptor';

@Component({ template: '', standalone: true })
class DummyComponent {}

describe('ApiErrorInterceptor — PHONE_REVERIFICATION_REQUIRED', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideRouter([
          { path: 'home', component: DummyComponent },
          { path: 'profile/phone-reverify', component: DummyComponent }
        ]),
        provideHttpClient(withInterceptors([ApiErrorInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  const restricted = { code: 'PHONE_REVERIFICATION_REQUIRED', message: 'Phone ownership must be reverified before this operation.' };

  it('✅ يشرح الوضع ويحوّل المستخدم إلى صفحة إعادة التحقق', fakeAsync(() => {
    spyOn(toast, 'error');
    router.navigateByUrl('/home');
    tick();

    let received: unknown;
    http.post(`${environment.apiUrl}/properties`, {}).subscribe({ error: e => (received = e) });
    httpMock.expectOne(`${environment.apiUrl}/properties`).flush(restricted, { status: 403, statusText: 'Forbidden' });
    tick();

    expect(router.url).toBe('/profile/phone-reverify');
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(received).toBeTruthy(); // the caller still gets the error
  }));

  it('✅ لا يعيد التوجيه إن كان المستخدم في صفحة إعادة التحقق أصلاً', fakeAsync(() => {
    spyOn(toast, 'error');
    router.navigateByUrl('/profile/phone-reverify');
    tick();
    const navigate = spyOn(router, 'navigateByUrl').and.callThrough();

    http.post(`${environment.apiUrl}/properties`, {}).subscribe({ error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/properties`).flush(restricted, { status: 403, statusText: 'Forbidden' });
    tick();

    expect(navigate).not.toHaveBeenCalled();
  }));

  it('✅ أي 403 آخر لا يحوّل المستخدم', fakeAsync(() => {
    spyOn(toast, 'error');
    router.navigateByUrl('/home');
    tick();

    http.post(`${environment.apiUrl}/properties`, {}).subscribe({ error: () => {} });
    httpMock.expectOne(`${environment.apiUrl}/properties`)
      .flush({ code: 'FORBIDDEN', message: 'no' }, { status: 403, statusText: 'Forbidden' });
    tick();

    expect(router.url).toBe('/home');
  }));
});
