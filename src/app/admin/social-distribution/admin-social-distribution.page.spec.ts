// =====================================================================
// ✅ Unit Tests – admin-social-distribution.page.spec.ts
// تغطية: حصر المنصات على الجاهزة فعلاً (isLive)، تبويب قواعد التوزيع (إنشاء/تعديل بلا
// تغيير الحساب المستهدف)، وتبويب Dead Letters (تحميل المعلّقة، إعادة إدراج، حلّ بملاحظة).
// =====================================================================
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  DistributionRuleDto,
  SocialAccountDto,
  SocialPublicationDeadLetterDto,
  SocialPublisherInfoDto,
} from '../../core/api/admin-social-distribution.service';
import { AdminSocialDistributionPage } from './admin-social-distribution.page';

describe('AdminSocialDistributionPage — publishers, rules, dead letters', () => {
  let fixture: ComponentFixture<AdminSocialDistributionPage>;
  let page: AdminSocialDistributionPage;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/social-distribution`;

  const publishers: SocialPublisherInfoDto[] = [
    { platform: 'Facebook', capabilities: {}, isLive: false },
    { platform: 'Instagram', capabilities: {}, isLive: false },
    { platform: 'Telegram', capabilities: {}, isLive: true },
    { platform: 'TikTok', capabilities: {}, isLive: false },
    { platform: 'YouTube', capabilities: {}, isLive: false },
    { platform: 'LinkedIn', capabilities: {}, isLive: false },
  ];

  const account: SocialAccountDto = {
    id: 'a1',
    socialChannelId: 'c1',
    platform: 'Telegram',
    displayName: 'قناة هدهد نيست',
    externalAccountId: '@hudhudnest',
    status: 'Active',
    accountType: 'Channel',
    governorateId: null,
    hasCredential: true,
    connectedAt: null,
    disconnectedAt: null,
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  };

  const rule: DistributionRuleDto = {
    id: 'r1',
    name: 'إيجارات دمشق',
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

  const paged = <T>(items: T[]) => ({ items, totalCount: items.length, page: 1, pageSize: 20 });

  function boot(list: SocialPublisherInfoDto[] = publishers): void {
    fixture = TestBed.createComponent(AdminSocialDistributionPage);
    page = fixture.componentInstance;
    fixture.detectChanges();

    http.expectOne(r => r.url.endsWith('/lookups/governorates')).flush([]);
    http.expectOne(`${base}/publishers`).flush(list);
    http.expectOne(`${base}/dashboard/summary`).flush({ byPlatform: [], byProvince: [] });
  }

  function openRulesTab(): void {
    page.selectTab('rules');
    http.expectOne(r => r.url.endsWith('/lookups/property-type-catalog')).flush([]);
    const accounts = http.expectOne(r => r.url === `${base}/accounts` && r.params.get('pageSize') === '100');
    accounts.flush(paged([account]));
    http.expectOne(r => r.url === `${base}/rules`).flush(paged([rule]));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminSocialDistributionPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('المنصات الجاهزة فقط', () => {
    it('✅ نموذج القناة يعطّل المنصات بلا ناشر فعلي ويختار الجاهزة افتراضياً', () => {
      boot();
      page.selectTab('channels');
      http.expectOne(`${base}/channels`).flush([]);

      page.openCreateChannelForm();
      fixture.detectChanges();

      expect(page.channelForm.controls.platform.value).toBe('Telegram');
      const options = Array.from<HTMLOptionElement>(fixture.nativeElement.querySelectorAll('form select option'));
      const byValue = (value: string) => options.find(o => o.value.includes(value))!;
      expect(byValue('Telegram').disabled).toBeFalse();
      expect(byValue('Facebook').disabled).toBeTrue();
      expect(byValue('TikTok').disabled).toBeTrue();
      expect(byValue('Facebook').textContent).toContain('غير متاح');
    });

    it('✅ إن تعذّر تحميل الناشرين لا تُحجب أي منصة', () => {
      fixture = TestBed.createComponent(AdminSocialDistributionPage);
      page = fixture.componentInstance;
      fixture.detectChanges();
      http.expectOne(r => r.url.endsWith('/lookups/governorates')).flush([]);
      http.expectOne(`${base}/publishers`).flush('boom', { status: 500, statusText: 'Server Error' });
      http.expectOne(`${base}/dashboard/summary`).flush({ byPlatform: [], byProvince: [] });

      expect(page.isPlatformLive('Facebook')).toBeTrue();
    });
  });

  describe('قواعد التوزيع', () => {
    it('✅ فتح التبويب يحمّل القواعد والحسابات وأنواع العقارات', () => {
      boot();
      openRulesTab();

      expect(page.rules().items).toEqual([rule]);
      expect(page.ruleTargetAccounts()).toEqual([account]);
    });

    it('✅ إنشاء قاعدة: يرسل الأرقام والفارغ كـnull مع الحساب المستهدف ثم يعيد تحميل القائمة', () => {
      boot();
      openRulesTab();

      page.openCreateRuleForm();
      page.ruleForm.patchValue({ name: '  إيجارات دمشق  ', provinceId: '1', transactionType: 'ForRent', priority: 10 });
      page.saveRule();

      const req = http.expectOne(r => r.url === `${base}/rules` && r.method === 'POST');
      expect(req.request.body).toEqual({
        name: 'إيجارات دمشق',
        description: null,
        provinceId: 1,
        propertyTypeId: null,
        transactionType: 'ForRent',
        priority: 10,
        startAt: null,
        endAt: null,
        socialAccountId: 'a1',
      });
      req.flush(rule);
      http.expectOne(r => r.url === `${base}/rules` && r.method === 'GET').flush(paged([rule]));
    });

    it('✅ نموذج إنشاء بلا اسم لا يُرسَل', () => {
      boot();
      openRulesTab();

      page.openCreateRuleForm();
      page.saveRule();

      http.expectNone(r => r.url === `${base}/rules` && r.method === 'POST');
      expect(page.ruleForm.controls.name.touched).toBeTrue();
    });

    it('✅ تعديل قاعدة: PATCH بلا socialAccountId، والحساب المستهدف معطَّل في النموذج', () => {
      boot();
      openRulesTab();

      page.openEditRuleForm(rule);
      expect(page.ruleForm.controls.socialAccountId.disabled).toBeTrue();
      page.ruleForm.patchValue({ priority: 99 });
      page.saveRule();

      const req = http.expectOne(`${base}/rules/r1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.priority).toBe(99);
      expect(Object.keys(req.request.body)).not.toContain('socialAccountId');
      req.flush({ ...rule, priority: 99 });
      http.expectOne(r => r.url === `${base}/rules` && r.method === 'GET').flush(paged([rule]));
    });

    it('✅ التفعيل/التعطيل يحدّث الصف مكانه دون إعادة تحميل', () => {
      boot();
      openRulesTab();

      page.toggleRule(rule);
      const req = http.expectOne(`${base}/rules/r1/deactivate`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...rule, isActive: false });

      expect(page.rules().items[0].isActive).toBeFalse();
    });

    it('✅ الأرشفة تتطلب تأكيداً ثم DELETE', () => {
      boot();
      openRulesTab();

      page.requestArchive(rule);
      expect(page.archivingRule()).toEqual(rule);
      page.confirmArchive();

      const req = http.expectOne(`${base}/rules/r1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ ...rule, isArchived: true });
      http.expectOne(r => r.url === `${base}/rules` && r.method === 'GET').flush(paged([]));
      expect(page.archivingRule()).toBeNull();
    });
  });

  describe('Dead Letters', () => {
    function openDeadLetters(): void {
      page.selectTab('deadLetters');
      http.expectOne(r => r.url === `${base}/dead-letters` && r.params.get('resolved') === 'false').flush(paged([deadLetter]));
    }

    it('✅ يحمّل المعلّقة فقط افتراضياً', () => {
      boot();
      openDeadLetters();

      expect(page.deadLetters().items).toEqual([deadLetter]);
      expect(page.deadLetterErrorHint('InvalidCredentials')).toContain('أعد ربط الحساب');
    });

    it('✅ "الكل" لا يرسل resolved', () => {
      boot();
      openDeadLetters();

      page.deadLetterView = 'all';
      page.applyDeadLetterView();

      const req = http.expectOne(r => r.url === `${base}/dead-letters`);
      expect(req.request.params.has('resolved')).toBeFalse();
      req.flush(paged([]));
    });

    it('✅ إعادة الإدراج: POST /requeue ثم إعادة تحميل القائمة وتفريغ ملخص اللوحة', () => {
      boot();
      openDeadLetters();

      page.requeueDeadLetter(deadLetter);
      http.expectOne(`${base}/dead-letters/d1/requeue`).flush(deadLetter);

      expect(page.summary()).toBeNull();
      http.expectOne(r => r.url === `${base}/dead-letters` && r.params.get('resolved') === 'false').flush(paged([]));
    });

    it('✅ تسجيل الحل: POST /resolve بالملاحظة وعلم الإعادة', () => {
      boot();
      openDeadLetters();

      page.requestResolve(deadLetter);
      page.resolveNote = '  جُدّد التوكن  ';
      page.resolveRequeue = true;
      page.confirmResolve();

      const req = http.expectOne(`${base}/dead-letters/d1/resolve`);
      expect(req.request.body).toEqual({ note: 'جُدّد التوكن', requeue: true });
      req.flush({ ...deadLetter, resolvedAt: '2026-10-02T11:00:00Z' });
      http.expectOne(r => r.url === `${base}/dead-letters` && r.params.get('resolved') === 'false').flush(paged([]));
      expect(page.resolvingDeadLetter()).toBeNull();
    });
  });
});
