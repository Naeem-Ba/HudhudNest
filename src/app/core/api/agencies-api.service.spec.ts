// =====================================================================
// agencies-api.service.spec.ts — المسارات وأجسام الطلبات لكل نقاط AgenciesController
// التي تستهلكها شاشات إدارة المكتب (/UI-06/)، ومستخرج معرّف المستخدم لحقل الدعوة.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { extractUserId, parseInviteTarget } from '../models/agency.model';
import { AgenciesApiService } from './agencies-api.service';

const AGENCY_ID = '11111111-2222-3333-4444-555555555555';
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const INVITATION_ID = '99999999-8888-7777-6666-555555555555';

describe('AgenciesApiService', () => {
  let service: AgenciesApiService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/agencies`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(AgenciesApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getBySlug: GET /agencies/{slug} مع ترميز الـ slug', () => {
    service.getBySlug('sham realty').subscribe();
    const req = httpMock.expectOne(`${base}/sham%20realty`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('createInvitation: يرسل { userId } فقط', () => {
    service.createInvitation(AGENCY_ID, USER_ID).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/invitations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: USER_ID });
    req.flush({});
  });

  it('accept/decline: POST على مسار الدعوة', () => {
    service.acceptInvitation(INVITATION_ID).subscribe();
    service.declineInvitation(INVITATION_ID).subscribe();
    const accept = httpMock.expectOne(`${base}/invitations/${INVITATION_ID}/accept`);
    const decline = httpMock.expectOne(`${base}/invitations/${INVITATION_ID}/decline`);
    expect(accept.request.method).toBe('POST');
    expect(decline.request.method).toBe('POST');
    accept.flush({});
    decline.flush(null);
  });

  it('removeMember: DELETE /agencies/{id}/members/{userId}', () => {
    service.removeMember(AGENCY_ID, USER_ID).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/members/${USER_ID}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('transferOwnership: يرسل { newOwnerUserId }', () => {
    service.transferOwnership(AGENCY_ID, USER_ID).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/transfer-ownership`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ newOwnerUserId: USER_ID });
    req.flush({});
  });

  it('uploadLogo: multipart بحقل file (اسم الحقل الذي يقرؤه IFormFile file)', () => {
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    service.uploadLogo(AGENCY_ID, file).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/logo`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect((req.request.body as FormData).get('file')).toBeTruthy();
    req.flush({});
  });

  it('createInvitationByContact: يرسل البريد أو الهاتف إلى by-contact', () => {
    service.createInvitationByContact(AGENCY_ID, { email: 'sara@example.com' }).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/invitations/by-contact`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'sara@example.com' });
    req.flush({});
  });

  it('getSentInvitations: GET /agencies/{id}/invitations', () => {
    service.getSentInvitations(AGENCY_ID).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/invitations`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('reactivate: POST /agencies/{id}/reactivate', () => {
    service.reactivate(AGENCY_ID).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}/reactivate`);
    expect(req.request.method).toBe('POST');
    req.flush(null);
  });

  it('deactivate: DELETE /agencies/{id}', () => {
    service.deactivate(AGENCY_ID).subscribe();
    const req = httpMock.expectOne(`${base}/${AGENCY_ID}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

describe('extractUserId', () => {
  it('يقبل المعرّف كما هو', () => {
    expect(extractUserId(`  ${USER_ID}  `)).toBe(USER_ID);
  });

  it('يستخرج المعرّف من رابط الصفحة العامة ويوحّد حالة الأحرف', () => {
    expect(extractUserId(`https://hudhudnest.com/users/${USER_ID.toUpperCase()}?tab=ratings`)).toBe(USER_ID);
  });

  it('يعيد null لنص بلا معرّف صالح', () => {
    expect(extractUserId('ahmad@example.com')).toBeNull();
    expect(extractUserId('')).toBeNull();
    expect(extractUserId(null)).toBeNull();
  });
});

describe('parseInviteTarget', () => {
  it('المعرّف أو رابط الصفحة يُعامَل كمعرّف', () => {
    expect(parseInviteTarget(`https://hudhudnest.com/users/${USER_ID}`)).toEqual({ kind: 'id', userId: USER_ID });
  });

  it('البريد يُوحَّد بأحرف صغيرة', () => {
    expect(parseInviteTarget('  Sara@Example.com ')).toEqual({ kind: 'email', email: 'sara@example.com' });
  });

  it('رقم الهاتف يُمرَّر كما هو (التطبيع في الخادم)', () => {
    expect(parseInviteTarget('+963 911 234 567')).toEqual({ kind: 'phone', phoneNumber: '+963 911 234 567' });
  });

  it('نص لا يشبه أيًّا منها يعيد null', () => {
    expect(parseInviteTarget('sara')).toBeNull();
    expect(parseInviteTarget('12345')).toBeNull();
    expect(parseInviteTarget('')).toBeNull();
  });
});
