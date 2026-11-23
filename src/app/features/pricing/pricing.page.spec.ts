// =====================================================================
// ✅ Unit Tests – pricing.page.spec.ts
// أول تغطية لهذا المكوّن. يغطي تحديدًا الإصلاحات المطلوبة:
//   1) التمييز الذهبي يتبع الاختيار الفعلي (selectedTier) لا isRecommended
//      الثابت، ولا شيء محدَّد افتراضيًا عند فتح الصفحة.
//   2) اختيار خطة أخرى ينقل التمييز إليها فورًا (خطة واحدة فقط في كل مرة).
//   3) اختيار الخطة المجانية (مستخدم مسجَّل الدخول) ينجح فيرسل POST
//      /users/me/plan، يعرض رسالة نجاح، وينقل إلى /property-form مباشرة.
//   4) فشل حفظ الاختيار في الخادم يمنع الانتقال ويعرض رسالة خطأ بدل تركه
//      يصل لصفحة إضافة الإعلان بلا خطة محفوظة فعليًا.
//   5) زائر غير مسجَّل الدخول يختار الخطة المجانية ⇐ يُرسَل لتسجيل الدخول مع
//      returnUrl يحمل ?autoSelect=free بدل الذهاب لـ property-form مباشرة
//      (الذي كان سيُعيده AuthGuard إلى هنا بلا أي أثر للاختيار).
//   6) العودة من الدخول بـ ?autoSelect=free تُكمل الاختيار تلقائيًا — فقط حين تسبقها
//      علامة لمرة واحدة تركتها ضغطة الزائر في هذا التبويب (F-22: رابط مصنوع وحده لا
//      يغيّر خطة أحد).
// =====================================================================
import { HttpErrorResponse } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { PricingPage } from './pricing.page';
import { PlansApiService } from '../../core/api/plans-api.service';
import { PaymentsApiService } from '../../core/api/payments-api.service';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency } from '../../core/models/agency.model';
import { ProfileService } from '../../core/api/profile.service';
import { AuthService } from '../../core/auth/auth.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { ToastService } from '../../shared/services/toast.service';
import { SubscriptionPlan } from '../../core/models/subscription-plan.model';

const PLANS: SubscriptionPlan[] = [
  {
    tier: 'free',
    nameKey: 'PRICING.FREE.NAME',
    taglineKey: 'PRICING.FREE.TAGLINE',
    priceKind: 'free',
    priceUsd: 0,
    featureKeys: [],
    isRecommended: false,
    ctaKey: 'PRICING.FREE.CTA',
    ctaRoute: '/property-form',
    ctaQueryParams: {}
  },
  {
    tier: 'premium',
    nameKey: 'PRICING.PREMIUM.NAME',
    taglineKey: 'PRICING.PREMIUM.TAGLINE',
    priceKind: 'monthly',
    priceUsd: 99,
    featureKeys: [],
    // The one flag prior behaviour keyed the permanent gold highlight off —
    // must NOT drive selectedTier by itself any more.
    isRecommended: true,
    ctaKey: 'PRICING.PREMIUM.CTA',
    ctaRoute: '/kontakt',
    ctaQueryParams: { plan: 'premium' }
  }
];

const MARKER_KEY = 'pricing.pendingAutoSelect';

/** Stands in for the marker onSelectPlan leaves when a signed-out visitor taps a plan. */
function armMarker(tier: string, ageMs = 0): void {
  sessionStorage.setItem(MARKER_KEY, JSON.stringify({ tier, at: Date.now() - ageMs }));
}

describe('PricingPage', () => {
  beforeEach(() => sessionStorage.removeItem(MARKER_KEY));
  afterEach(() => sessionStorage.removeItem(MARKER_KEY));

  let plansApiSpy: jasmine.SpyObj<PlansApiService>;
  let paymentsApiSpy: jasmine.SpyObj<PaymentsApiService>;
  let profileServiceSpy: jasmine.SpyObj<ProfileService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let agenciesApiSpy: jasmine.SpyObj<AgenciesApiService>;
  let profile$: BehaviorSubject<{ PendingPlanTier?: string | null; PlanTier?: string | null; PlanStatus?: string | null; PlanExpiresAt?: string | null } | null>;

  function createComponent(
    accessToken: string | null,
    queryParams: Record<string, string> = {},
    ownedAgency: Agency | null = null,
    onlinePayments = false
  ): PricingPage {
    agenciesApiSpy = jasmine.createSpyObj('AgenciesApiService', ['getMine']);
    agenciesApiSpy.getMine.and.returnValue(of(ownedAgency));

    paymentsApiSpy = jasmine.createSpyObj('PaymentsApiService', ['catalog']);
    paymentsApiSpy.catalog.and.returnValue(of({ enabled: onlinePayments, providers: onlinePayments ? [{ code: 'test' }] : [], termsVersion: 'v1', refundRequestWindowDays: 14 } as never));

    plansApiSpy = jasmine.createSpyObj('PlansApiService', ['getPlans', 'selectPlan']);
    plansApiSpy.getPlans.and.returnValue(of(PLANS));
    plansApiSpy.selectPlan.and.callFake(tier =>
      of(tier === 'free'
        ? { status: 'activated' as const, tier, requestId: null }
        : { status: 'pending' as const, tier, requestId: 'req-1' }));

    profile$ = new BehaviorSubject<{ PendingPlanTier?: string | null; PlanTier?: string | null; PlanStatus?: string | null; PlanExpiresAt?: string | null } | null>(null);
    profileServiceSpy = jasmine.createSpyObj('ProfileService', ['refresh'], { profile$ });
    profileServiceSpy.refresh.and.returnValue(of({}));

    authServiceSpy = jasmine.createSpyObj('AuthService', ['getAccessToken', 'getCurrentUserId']);
    authServiceSpy.getAccessToken.and.returnValue(accessToken);
    authServiceSpy.getCurrentUserId.and.returnValue('owner-1');

    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error', 'info']);

    TestBed.configureTestingModule({
      imports: [PricingPage],
      providers: [
        { provide: PlansApiService, useValue: plansApiSpy },
        { provide: PaymentsApiService, useValue: paymentsApiSpy },
        { provide: ProfileService, useValue: profileServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AgenciesApiService, useValue: agenciesApiSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } }
        },
        { provide: PageMetaService, useValue: jasmine.createSpyObj('PageMetaService', ['applyTranslated']) },
        { provide: ToastService, useValue: toastSpy },
        {
          provide: TranslateService,
          useValue: jasmine.createSpyObj('TranslateService', ['instant', 'get'], {
            onLangChange: of({}),
            onTranslationChange: of({}),
            onDefaultLangChange: of({})
          })
        }
      ]
    });

    const fixture = TestBed.createComponent(PricingPage);
    const instance = fixture.componentInstance;
    (TestBed.inject(TranslateService).get as jasmine.Spy).and.returnValue(of({}));
    instance.ngOnInit();
    return instance;
  }

  it('لا خطة محدَّدة افتراضيًا عند فتح الصفحة، حتى لو كانت isRecommended=true', () => {
    const component = createComponent('token-123');
    expect(component.selectedTier()).toBeNull();
  });

  it('النقر على بطاقة يجعلها الوحيدة المحدَّدة، والنقر على بطاقة أخرى ينقل التمييز إليها', () => {
    const component = createComponent('token-123');

    component.selectCard(PLANS[0]);
    expect(component.selectedTier()).toBe('free');

    component.selectCard(PLANS[1]);
    expect(component.selectedTier()).toBe('premium');
  });

  it('مستخدم مسجَّل الدخول يختار الخطة المجانية بنجاح ⇐ POST + رسالة نجاح + انتقال لـ property-form', () => {
    const component = createComponent('token-123');

    component.onSelectPlan(PLANS[0]);

    expect(plansApiSpy.selectPlan).toHaveBeenCalledWith('free');
    expect(toastSpy.success).toHaveBeenCalled();
    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/property-form'], { queryParams: {} });
    expect(component.selectedTier()).toBe('free');
    expect(component.selecting()).toBeNull();
  });

  it('خطة مدفوعة ⇐ لا رسالة نجاح قبل إرسال رسالة التواصل، فقط إرشاد للخطوة التالية', () => {
    const component = createComponent('token-123');

    component.onSelectPlan(PLANS[1]);

    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(toastSpy.info).toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalled();
  });

  it('خطة مدفوعة ⇐ رقم الطلب يُمرَّر إلى نموذج التواصل، والمجانية بلا مرجع', () => {
    const component = createComponent('token-123');

    component.onSelectPlan(PLANS[1]);
    const [, paidOptions] = routerSpy.navigate.calls.mostRecent().args as [unknown, { queryParams: Record<string, string> }];
    expect(paidOptions.queryParams['ref']).toBe('req-1');

    component.onSelectPlan(PLANS[0]);
    const [, freeOptions] = routerSpy.navigate.calls.mostRecent().args as [unknown, { queryParams: Record<string, string> }];
    expect(freeOptions.queryParams['ref']).toBeUndefined();
  });

  it('فشل حفظ اختيار الخطة في الخادم يمنع الانتقال ويعرض رسالة خطأ', () => {
    const component = createComponent('token-123');
    plansApiSpy.selectPlan.and.returnValue(throwError(() => new Error('network')));

    component.onSelectPlan(PLANS[0]);

    expect(toastSpy.error).toHaveBeenCalled();
    expect(toastSpy.success).not.toHaveBeenCalled();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
    expect(component.selecting()).toBeNull();
  });

  it('لا يمكن إطلاق طلب اختيار ثانٍ أثناء وجود طلب قيد التنفيذ', () => {
    const component = createComponent('token-123');
    component.selecting.set('free');

    component.onSelectPlan(PLANS[1]);

    expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
  });

  it('زائر غير مسجَّل الدخول يختار الخطة المجانية ⇐ يُرسَل لتسجيل الدخول مع autoSelect=free، لا لـ property-form مباشرة', () => {
    const component = createComponent(null);

    component.onSelectPlan(PLANS[0]);

    expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/pricing?autoSelect=free' }
    });

    const marker = JSON.parse(sessionStorage.getItem(MARKER_KEY) ?? 'null');
    expect(marker.tier).toBe('free');
    expect(Date.now() - marker.at).toBeLessThan(5000);
  });

  it('F-22: تعذّر الكتابة في sessionStorage لا يمنع التوجيه إلى تسجيل الدخول', () => {
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    const component = createComponent(null);

    expect(() => component.onSelectPlan(PLANS[0])).not.toThrow();

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/login'], {
      queryParams: { returnUrl: '/pricing?autoSelect=free' }
    });
  });

  it('زائر غير مسجَّل الدخول يختار خطة مدفوعة ⇐ يذهب مباشرة لصفحة التواصل، بلا تسجيل دخول', () => {
    const component = createComponent(null);

    component.onSelectPlan(PLANS[1]);

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/kontakt'], {
      queryParams: { plan: 'premium' }
    });
  });

  it('العودة من الدخول بـ ?autoSelect=free تُكمل الاختيار تلقائيًا دون ضغطة ثانية', () => {
    armMarker('free');
    const component = createComponent('token-123', { autoSelect: 'free' });

    expect(plansApiSpy.selectPlan).toHaveBeenCalledWith('free');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/property-form'], { queryParams: {} });
    expect(component).toBeTruthy();
  });

  it('autoSelect القديم يُتجاهَل إن كان المستخدم ما زال غير مسجَّل الدخول', () => {
    createComponent(null, { autoSelect: 'free' });

    expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
  });

  describe('F-22: ?autoSelect وحده لا يغيّر خطة أحد', () => {
    it('مسجَّل الدخول يفتح الرابط بلا علامة ⇐ لا طلب اختيار', () => {
      createComponent('token-123', { autoSelect: 'free' });
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('الخطة المدفوعة أيضًا: رابط ?autoSelect=premium بلا علامة لا ينشئ طلبًا معلّقًا', () => {
      createComponent('token-123', { autoSelect: 'premium' });
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    });

    it('علامة صحيحة تعمل مرة واحدة فقط: إعادة التحميل أو الرجوع لا تكرر الطلب', () => {
      armMarker('free');
      const component = createComponent('token-123', { autoSelect: 'free' });
      expect(plansApiSpy.selectPlan).toHaveBeenCalledTimes(1);
      expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();

      plansApiSpy.selectPlan.calls.reset();
      component.ngOnInit();

      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    });

    it('علامة لخطة أخرى ⇐ لا طلب، وتُحذف العلامة', () => {
      armMarker('free');
      createComponent('token-123', { autoSelect: 'premium' });
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();
    });

    it('علامة منتهية (أقدم من 15 دقيقة) ⇐ لا طلب', () => {
      armMarker('free', 16 * 60 * 1000);
      createComponent('token-123', { autoSelect: 'free' });
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    });

    it('علامة بوقت في المستقبل ⇐ لا طلب', () => {
      armMarker('free', -60 * 1000);
      createComponent('token-123', { autoSelect: 'free' });
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    });

    for (const raw of ['not json', 'null', '"free"', '{}', '{"tier":"free"}', '{"tier":"free","at":"now"}']) {
      it(`علامة تالفة ${raw} ⇐ لا طلب، وتُحذف`, () => {
        sessionStorage.setItem(MARKER_KEY, raw);
        createComponent('token-123', { autoSelect: 'free' });
        expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
        expect(sessionStorage.getItem(MARKER_KEY)).toBeNull();
      });
    }

    it('تعذّر القراءة من sessionStorage ⇐ لا انهيار ولا طلب', () => {
      armMarker('free');
      spyOn(Storage.prototype, 'getItem').and.throwError('blocked');

      expect(() => createComponent('token-123', { autoSelect: 'free' })).not.toThrow();
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    });

    it('زائر ما زال غير مسجَّل ⇐ لا طلب، والعلامة باقية لجولة الدخول الفعلية', () => {
      armMarker('free');
      createComponent(null, { autoSelect: 'free' });
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(MARKER_KEY)).not.toBeNull();
    });
  });
  it('طلب خطة بانتظار المشرف يظهر على بطاقتها فقط ويختفي عند التفعيل', () => {
    const component = createComponent('token-123');
    expect(component.pendingTier()).toBeNull();

    profile$.next({ PendingPlanTier: 'premium' });
    expect(component.pendingTier()).toBe('premium');

    profile$.next({ PendingPlanTier: null });
    expect(component.pendingTier()).toBeNull();
  });

  describe('an active paid plan', () => {
    it('الخطة السارية تُعرض مع تاريخها، وبطاقة المجانية معطّلة ولا يُرسَل طلبها', () => {
      const component = createComponent('token-123');
      profile$.next({ PlanTier: 'premium', PlanStatus: 'Active', PlanExpiresAt: '2026-12-01T00:00:00Z' });

      expect(component.currentPaidTier()).toBe('premium');
      expect(component.currentPlanExpiresAt()).toBe('2026-12-01T00:00:00Z');
      expect(component.isBlockedByPaidPlan(PLANS[0])).toBeTrue();

      component.onSelectPlan(PLANS[0]);
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
    });

    it('خطة منتهية أو ملغاة أو مجانية ليست «سارية»: المجانية تبقى متاحة', () => {
      const component = createComponent('token-123');

      profile$.next({ PlanTier: 'premium', PlanStatus: 'Expired', PlanExpiresAt: '2026-01-01T00:00:00Z' });
      expect(component.currentPaidTier()).toBeNull();
      expect(component.isBlockedByPaidPlan(PLANS[0])).toBeFalse();

      profile$.next({ PlanTier: 'premium', PlanStatus: 'Cancelled' });
      expect(component.currentPaidTier()).toBeNull();

      profile$.next({ PlanTier: 'free', PlanStatus: 'Active' });
      expect(component.currentPaidTier()).toBeNull();
    });
  });

  describe('agency owners and the free plan', () => {
    const ownedAgency = { id: 'a1', ownerUserId: 'owner-1' } as Agency;

    it('مالك مكتب: بطاقة المجانية معطّلة ولا يُرسَل طلب اختيارها', () => {
      const component = createComponent('token-123', {}, ownedAgency);

      expect(component.ownsAgency()).toBeTrue();
      expect(component.isBlockedForAgencyOwner(PLANS[0])).toBeTrue();
      expect(component.isBlockedForAgencyOwner(PLANS[1])).toBeFalse();

      component.onSelectPlan(PLANS[0]);

      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
      expect(component.selectedTier()).toBeNull();
    });

    it('مالك مكتب يستطيع اختيار خطة مدفوعة', () => {
      const component = createComponent('token-123', {}, ownedAgency);

      component.onSelectPlan(PLANS[1]);

      expect(plansApiSpy.selectPlan).toHaveBeenCalledWith('premium');
    });

    it('عضو غير مالك يبقى بإمكانه اختيار المجانية', () => {
      const member = createComponent('token-123', {}, { id: 'a1', ownerUserId: 'someone-else' } as Agency);

      expect(member.isBlockedForAgencyOwner(PLANS[0])).toBeFalse();
    });

    it('من لا مكتب له يبقى بإمكانه اختيار المجانية', () => {
      const none = createComponent('token-123');

      expect(none.isBlockedForAgencyOwner(PLANS[0])).toBeFalse();
    });

    it('رفض الخادم برمز AGENCY_FREE_PLAN_NOT_ALLOWED لا يضيف توستًا عامًا فوق رسالة المعترض المترجمة', () => {
      const component = createComponent('token-123');
      plansApiSpy.selectPlan.and.returnValue(throwError(() => new HttpErrorResponse({
        status: 403,
        error: { code: 'AGENCY_FREE_PLAN_NOT_ALLOWED', message: 'ar' }
      })));

      component.onSelectPlan(PLANS[0]);

      expect(toastSpy.error).not.toHaveBeenCalled();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('?reason=agency-plan-required يُظهر شرح الخطة المدفوعة', () => {
      const component = createComponent('token-123', { reason: 'agency-plan-required' });

      expect(component.showAgencyPlanBanner()).toBeTrue();
    });
  });

  describe('with online payments switched on', () => {
    it('sends a signed-in visitor choosing a priced plan to the payment checkout, without recording a pending request', () => {
      const component = createComponent('token', {}, null, true);
      expect(component.onlinePayments()).toBeTrue();

      component.onSelectPlan(PLANS[1]);

      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/payments/checkout'], { queryParams: { product: 'plan', plan: 'premium' } });
    });

    it('sends a signed-out visitor through login and back to the checkout', () => {
      const component = createComponent(null, {}, null, true);

      component.onSelectPlan(PLANS[1]);

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/auth/login'], {
        queryParams: { returnUrl: '/payments/checkout?product=plan&plan=premium' }
      });
    });

    it('keeps the free plan on the old flow', () => {
      const component = createComponent('token', {}, null, true);

      component.onSelectPlan(PLANS[0]);

      expect(plansApiSpy.selectPlan).toHaveBeenCalledWith('free');
    });
  });

  it('keeps the request-and-contact flow while online payments are off', () => {
    const component = createComponent('token');
    expect(component.onlinePayments()).toBeFalse();

    component.onSelectPlan(PLANS[1]);

    expect(plansApiSpy.selectPlan).toHaveBeenCalledWith('premium');
  });

  // Comprehensive audit 2026-11-17 (R-09): App Store 3.1.1 / Play billing. The installed app cannot sell paid plans
  // without in-app billing, so it shows only the free plan (and a plan already bought on the website).
  describe('in the installed app', () => {
    beforeEach(() => spyOn(Capacitor, 'isNativePlatform').and.returnValue(true));

    it('shows only the free plan and does not start a paid selection', () => {
      const component = createComponent('token-123');

      expect(component.visiblePlans().map(p => p.priceKind)).toEqual(['free']);
      component.onSelectPlan(PLANS[1]);
      expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('still shows the paid plan the user already has', () => {
      const component = createComponent('token-123');
      component.currentPaidTier.set('premium');

      expect(component.visiblePlans().map(p => p.tier)).toContain('premium');
    });
  });

  it('the website shows every plan', () => {
    const component = createComponent('token-123');
    expect(component.visiblePlans().length).toBe(PLANS.length);
  });
});

