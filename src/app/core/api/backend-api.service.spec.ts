// =====================================================================
// ✅ Unit Tests – backend-api.service.spec.ts
// Production incident (2026-09): /auth/* calls now route through resolveAuthApiBaseUrl()'s
// same-origin-proxied base on the deployed web app (see auth-api-base-url.ts), while every
// other endpoint keeps hitting environment.apiBaseUrl directly. This asserts that split by
// path, using this environment's real values (environmentName: 'local' — resolveAuthApiBaseUrl
// keeps the two identical there, exactly matching this project's other specs, which is why the
// existing csrf-token/refresh-auth-interceptor specs needed no changes for this fix).
// =====================================================================
import { HttpContext, HttpContextToken, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { BackendApiService } from './backend-api.service';

describe('BackendApiService', () => {
  let service: BackendApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(BackendApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('forwards extra request headers on POST (the view counter sends X-Visitor-Id this way)', () => {
    service.post('/properties/p1/views', undefined, { headers: { 'X-Visitor-Id': 'abc' } }).subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/properties/p1/views`);
    expect(req.request.headers.get('X-Visitor-Id')).toBe('abc');
    req.flush({});
  });

  it('✅ مسار /auth/... يُبنى عبر authBaseUrl (نفس apiBaseUrl هنا، لأن environmentName=local)', () => {
    service.post('/auth/login', { email: 'a@b.com' }).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.withCredentials).toBeTrue();
    req.flush({});
  });

  it('✅ مسار غير auth (كـ /properties) يُبنى عبر baseUrl العادي دون أي فرق', () => {
    service.get('/properties').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/properties`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('✅ /auth/phone/... (فرع فرعي) يُطابَق أيضاً — ليس فقط /auth/login الحرفي', () => {
    service.post('/auth/phone/login', {}).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/phone/login`);
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('✅ post/delete pass an HttpContext through (e.g. to opt out of the generic error toast)', () => {
    const flag = new HttpContextToken<boolean>(() => false);
    const context = new HttpContext().set(flag, true);

    service.post('/favorites/p1', undefined, { context }).subscribe();
    const post = httpMock.expectOne(`${environment.apiUrl}/favorites/p1`);
    expect(post.request.context.get(flag)).toBeTrue();
    post.flush({});

    service.delete('/favorites/p1', undefined, { context }).subscribe();
    const del = httpMock.expectOne(`${environment.apiUrl}/favorites/p1`);
    expect(del.request.context.get(flag)).toBeTrue();
    del.flush({});

    service.post('/favorites/p2').subscribe();
    const plain = httpMock.expectOne(`${environment.apiUrl}/favorites/p2`);
    expect(plain.request.context.get(flag)).toBeFalse();
    plain.flush({});
  });
});
