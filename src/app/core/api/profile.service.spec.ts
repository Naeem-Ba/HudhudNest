import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { ProfileService, UserProfile, agencyEligibility, hasPaidPlan } from './profile.service';

describe('ProfileService — loadFailed$', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;
  let failed: boolean | undefined;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
    service.loadFailed$.subscribe(v => (failed = v));
  });

  afterEach(() => httpMock.verify());

  it('✅ يبدأ false، يصبح true عند فشل /users/me، ويعود false عند نجاح لاحق', () => {
    expect(failed).toBeFalse();

    service.getMe().subscribe({ error: () => undefined });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({}, { status: 500, statusText: 'Server Error' });
    expect(failed).toBeTrue();

    service.refresh().subscribe();
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1', email: 'a@example.com' });
    expect(failed).toBeFalse();
  });

  it('✅ clearCache (تسجيل الخروج) يعيد الحالة إلى false', () => {
    service.getMe().subscribe({ error: () => undefined });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({}, { status: 500, statusText: 'Server Error' });

    service.clearCache();

    expect(failed).toBeFalse();
  });
});

describe('ProfileService — account deletion window and export', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ deleteAccount يرسل كلمة المرور ويعيد تاريخ الجدولة من استجابة 202', () => {
    let scheduledFor: string | null | undefined;
    service.deleteAccount('secret').subscribe(res => (scheduledFor = res.scheduledFor));

    const req = httpMock.expectOne(`${environment.apiUrl}/users/me`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ currentPassword: 'secret' });
    req.flush({ scheduledFor: '2026-11-03T10:00:00Z' }, { status: 202, statusText: 'Accepted' });

    expect(scheduledFor).toBe('2026-11-03T10:00:00Z');
  });

  it('✅ getMe يقرأ deletionScheduledFor، وnull عند غيابه', () => {
    let profile: { DeletionScheduledFor?: string | null } | undefined;
    service.getMe().subscribe(p => (profile = p));
    httpMock.expectOne(`${environment.apiUrl}/users/me`)
      .flush({ id: 'u1', deletionScheduledFor: '2026-11-03T10:00:00Z' });
    expect(profile?.DeletionScheduledFor).toBe('2026-11-03T10:00:00Z');

    service.getMe().subscribe(p => (profile = p));
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1' });
    expect(profile?.DeletionScheduledFor).toBeNull();
  });

  it('✅ cancelAccountDeletion يحدّث profile$ بعد الإلغاء', () => {
    let latest: { DeletionScheduledFor?: string | null } | null = null;
    service.profile$.subscribe(p => (latest = p));

    service.cancelAccountDeletion().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/users/me/deletion/cancel`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1', deletionScheduledFor: null });

    expect(latest!.DeletionScheduledFor).toBeNull();
  });

  it('✅ cancelAccountDeletion يعامل 404 (لا طلب معلَّق) كنجاح ويحدّث الملف', () => {
    let done = false;
    let failed = false;
    service.cancelAccountDeletion().subscribe({ next: () => (done = true), error: () => (failed = true) });

    httpMock.expectOne(`${environment.apiUrl}/users/me/deletion/cancel`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1' });

    expect(done).toBeTrue();
    expect(failed).toBeFalse();
  });

  it('✅ cancelAccountDeletion يمرّر الأخطاء الأخرى دون إعادة تحميل الملف', () => {
    let failed = false;
    service.cancelAccountDeletion().subscribe({ error: () => (failed = true) });

    httpMock.expectOne(`${environment.apiUrl}/users/me/deletion/cancel`)
      .flush(null, { status: 500, statusText: 'Server Error' });

    expect(failed).toBeTrue();
  });

  it('✅ exportMyData يستدعي GET /users/me/export', () => {
    let data: unknown;
    service.exportMyData().subscribe(d => (data = d));

    const req = httpMock.expectOne(`${environment.apiUrl}/users/me/export`);
    expect(req.request.method).toBe('GET');
    req.flush({ account: { id: 'u1' } });

    expect(data).toEqual({ account: { id: 'u1' } });
  });
});

describe('ProfileService — saving the profile', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('never sends the phone number: it is the login phone and changes only through the code flow', () => {
    service
      .updateProfile({ Vorname: 'Ada', Name: 'Lovelace', Phone: '+963911234567', PhoneConfirmed: false } as UserProfile)
      .subscribe({ error: () => undefined });

    const put = httpMock.expectOne(r => r.method === 'PUT' && r.url === `${environment.apiUrl}/users/me`);
    expect(put.request.body.firstName).toBe('Ada');
    expect('phoneNumber' in put.request.body).toBeFalse();
    put.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({});
  });
});

describe('ProfileService — home area', () => {
  let service: ProfileService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ProfileService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends only the governorate, then refreshes the profile from the server answer', () => {
    let result: UserProfile | undefined;
    service.setHomeGovernorate(6).subscribe(profile => (result = profile));

    const put = httpMock.expectOne(r => r.method === 'PUT' && r.url === `${environment.apiUrl}/users/me`);
    expect(put.request.body).toEqual({ homeGovernorateId: 6 });
    put.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1', homeGovernorateId: 6 });

    expect(result?.HomeGovernorateId).toBe(6);
  });

  it('clears the area with 0 (the API reads null as "leave unchanged")', () => {
    service.setHomeGovernorate(null).subscribe();

    const put = httpMock.expectOne(r => r.method === 'PUT' && r.url === `${environment.apiUrl}/users/me`);
    expect(put.request.body).toEqual({ homeGovernorateId: 0 });
    put.flush(null, { status: 204, statusText: 'No Content' });
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1', homeGovernorateId: null });
  });

  it('reads the area from /users/me, null when the account has none', () => {
    let first: UserProfile | undefined;
    service.getMe().subscribe(profile => (first = profile));
    httpMock.expectOne(`${environment.apiUrl}/users/me`).flush({ id: 'u1' });

    expect(first?.HomeGovernorateId).toBeNull();
  });

  it('a rejected id is reported and the profile is not refreshed', () => {
    let failed = false;
    service.setHomeGovernorate(9999).subscribe({ error: () => (failed = true) });

    httpMock.expectOne(r => r.method === 'PUT').flush({}, { status: 422, statusText: 'Unprocessable' });

    expect(failed).toBeTrue();
  });
});

describe('agencyEligibility — mirrors the API gate so the screen can explain what is missing', () => {
  const profile = (over: Partial<UserProfile>): UserProfile => ({ ...over });

  it('no profile or nothing confirmed is "unverified", whatever the plan', () => {
    expect(agencyEligibility(null)).toBe('unverified');
    expect(agencyEligibility(profile({ PlanTier: 'premium' }))).toBe('unverified');
  });

  it('email OR phone confirmed counts as verified', () => {
    expect(agencyEligibility(profile({ EmailConfirmed: true, PlanTier: 'basic' }))).toBe('ok');
    expect(agencyEligibility(profile({ PhoneConfirmed: true, PlanTier: 'basic' }))).toBe('ok');
  });

  it('verified but on the free plan, or with no plan, needs a paid plan', () => {
    expect(agencyEligibility(profile({ EmailConfirmed: true, PlanTier: 'free' }))).toBe('paid-plan-required');
    expect(agencyEligibility(profile({ EmailConfirmed: true, PlanTier: null }))).toBe('paid-plan-required');
  });

  it('hasPaidPlan ignores tier case', () => {
    expect(hasPaidPlan(profile({ PlanTier: 'FREE' }))).toBeFalse();
    expect(hasPaidPlan(profile({ PlanTier: 'Elite' }))).toBeTrue();
  });
});
