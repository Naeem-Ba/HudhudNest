// =====================================================================
// ✅ Unit Tests – admin-social-distribution.service.spec.ts
// تغطية: نقاط قواعد التوزيع (قراءة/إنشاء/تعديل/أرشفة/تفعيل/تعطيل)، وDead Letters
// (قراءة مع تصفية الحل، حلّ بملاحظة، إعادة إدراج)، وقائمة الناشرين مع isLive.
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  AdminSocialDistributionService,
  CreateDistributionRuleValue,
  DistributionRuleDto,
  SocialPublicationDeadLetterDto,
} from './admin-social-distribution.service';

describe('AdminSocialDistributionService — rules, dead letters, publishers', () => {
  let service: AdminSocialDistributionService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBaseUrl}/social-distribution`;

  const rule: DistributionRuleDto = {
    id: 'r1',
    name: 'كل العقارات في دمشق',
    description: null,
    provinceId: 1,
    propertyTypeId: null,
    transactionType: 'ForRent',
    socialAccountId: 'a1',
    priority: 10,
    isActive: true,
    isArchived: false,
    startAt: null,
    endAt: null,
    specificityScore: 2,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  };

  const deadLetter: SocialPublicationDeadLetterDto = {
    id: 'd1',
    publicationId: 'p1',
    socialAccountId: 'a1',
    platform: 'Telegram',
    lastErrorCode: 'InvalidCredentials',
    lastErrorMessage: 'رمز البوت مرفوض',
    attempts: 1,
    failedAt: '2026-10-02T10:00:00Z',
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionNote: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AdminSocialDistributionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('✅ getRules: يرسل الفلاتر والترقيم ويطبّع النتيجة المُرقَّمة', done => {
    service.getRules({ socialAccountId: 'a1', isActive: true, includeArchived: false, search: 'دمشق', page: 2, pageSize: 10 }).subscribe(result => {
      expect(result.items).toEqual([rule]);
      expect(result.page).toBe(2);
      done();
    });

    const req = httpMock.expectOne(r =>
      r.url === `${base}/rules`
      && r.params.get('socialAccountId') === 'a1'
      && r.params.get('isActive') === 'true'
      && r.params.get('includeArchived') === 'false'
      && r.params.get('search') === 'دمشق'
      && r.params.get('page') === '2'
      && r.params.get('pageSize') === '10'
    );
    expect(req.request.method).toBe('GET');
    req.flush({ items: [rule], totalCount: 11, page: 2, pageSize: 10 });
  });

  it('✅ getRules: بلا فلاتر يرسل الصفحة الأولى فقط ولا يرسل حقولاً فارغة', done => {
    service.getRules().subscribe(() => done());

    const req = httpMock.expectOne(r => r.url === `${base}/rules`);
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });

  it('✅ createRule: POST بنفس حقول CreateDistributionRuleRequest', () => {
    const value: CreateDistributionRuleValue = {
      name: rule.name,
      description: null,
      provinceId: 1,
      propertyTypeId: null,
      transactionType: 'ForRent',
      socialAccountId: 'a1',
      priority: 10,
      startAt: null,
      endAt: null,
    };

    service.createRule(value).subscribe(created => expect(created).toEqual(rule));

    const req = httpMock.expectOne(`${base}/rules`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(value);
    req.flush(rule);
  });

  it('✅ updateRule: PATCH بلا socialAccountId (لا يُعدَّل بعد الإنشاء)', () => {
    service.updateRule('r1', { name: 'جديد', description: null, provinceId: null, propertyTypeId: null, transactionType: null, priority: 5, startAt: null, endAt: null })
      .subscribe();

    const req = httpMock.expectOne(`${base}/rules/r1`);
    expect(req.request.method).toBe('PATCH');
    expect(Object.keys(req.request.body)).not.toContain('socialAccountId');
    req.flush(rule);
  });

  it('✅ archiveRule: DELETE (حذف منطقي)', () => {
    service.archiveRule('r1').subscribe();

    const req = httpMock.expectOne(`${base}/rules/r1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ ...rule, isArchived: true });
  });

  it('✅ activateRule / deactivateRule: POST على المسارين الصحيحين', () => {
    service.activateRule('r1').subscribe();
    const activate = httpMock.expectOne(`${base}/rules/r1/activate`);
    expect(activate.request.method).toBe('POST');
    activate.flush(rule);

    service.deactivateRule('r1').subscribe();
    const deactivate = httpMock.expectOne(`${base}/rules/r1/deactivate`);
    expect(deactivate.request.method).toBe('POST');
    deactivate.flush({ ...rule, isActive: false });
  });

  it('✅ getDeadLetters: يرسل resolved=false للمعلّقة فقط، ولا يرسله عند "الكل"', () => {
    service.getDeadLetters({ resolved: false, page: 1 }).subscribe();
    const unresolved = httpMock.expectOne(r => r.url === `${base}/dead-letters` && r.params.get('resolved') === 'false');
    expect(unresolved.request.method).toBe('GET');
    unresolved.flush({ items: [deadLetter], totalCount: 1, page: 1, pageSize: 20 });

    service.getDeadLetters({}).subscribe();
    const all = httpMock.expectOne(r => r.url === `${base}/dead-letters`);
    expect(all.request.params.has('resolved')).toBeFalse();
    all.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });

  it('✅ resolveDeadLetter: POST مع الملاحظة وعلم الإعادة', () => {
    service.resolveDeadLetter('d1', 'تم تجديد التوكن', true).subscribe();

    const req = httpMock.expectOne(`${base}/dead-letters/d1/resolve`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ note: 'تم تجديد التوكن', requeue: true });
    req.flush({ ...deadLetter, resolvedAt: '2026-10-02T11:00:00Z' });
  });

  it('✅ requeueDeadLetter: POST على /requeue بلا جسم', () => {
    service.requeueDeadLetter('d1').subscribe();

    const req = httpMock.expectOne(`${base}/dead-letters/d1/requeue`);
    expect(req.request.method).toBe('POST');
    req.flush(deadLetter);
  });

  it('✅ getPublishers: يعيد isLive لكل منصة', done => {
    service.getPublishers().subscribe(publishers => {
      expect(publishers.find(p => p.platform === 'Telegram')?.isLive).toBeTrue();
      expect(publishers.find(p => p.platform === 'TikTok')?.isLive).toBeFalse();
      done();
    });

    const req = httpMock.expectOne(`${base}/publishers`);
    expect(req.request.method).toBe('GET');
    req.flush([
      { platform: 'Telegram', capabilities: {}, isLive: true },
      { platform: 'TikTok', capabilities: {}, isLive: false },
    ]);
  });
});
