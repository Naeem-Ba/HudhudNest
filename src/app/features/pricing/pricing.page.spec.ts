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
//   6) العودة من الدخول بـ ?autoSelect=free تُكمل الاختيار تلقائيًا.
// =====================================================================
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { PricingPage } from './pricing.page';
import { PlansApiService } from '../../core/api/plans-api.service';
import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { Agency } from '../../core/models/agency.model';
import { ProfileService } from '../../core/api/profile.service';
import { AuthService } from '../../core/auth/auth.service';
import { MetaService } from '../../core/services/meta.service';
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

describe('PricingPage', () => {
  let plansApiSpy: jasmine.SpyObj<PlansApiService>;
  let profileServiceSpy: jasmine.SpyObj<ProfileService>;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let toastSpy: jasmine.SpyObj<ToastService>;
  let agenciesApiSpy: jasmine.SpyObj<AgenciesApiService>;
  let profile$: BehaviorSubject<{ PendingPlanTier?: string | null } | null>;

  function createComponent(
    accessToken: string | null,
    queryParams: Record<string, string> = {},
    ownedAgency: Agency | null = null
  ): PricingPage {
    agenciesApiSpy = jasmine.createSpyObj('AgenciesApiService', ['getMine']);
    agenciesApiSpy.getMine.and.returnValue(of(ownedAgency));

    plansApiSpy = jasmine.createSpyObj('PlansApiService', ['getPlans', 'selectPlan']);
    plansApiSpy.getPlans.and.returnValue(of(PLANS));
    plansApiSpy.selectPlan.and.callFake(tier =>
      of(tier === 'free'
        ? { status: 'activated' as const, tier, requestId: null }
        : { status: 'pending' as const, tier, requestId: 'req-1' }));

    profile$ = new BehaviorSubject<{ PendingPlanTier?: string | null } | null>(null);
    profileServiceSpy = jasmine.createSpyObj('ProfileService', ['refresh'], { profile$ });
    profileServiceSpy.refresh.and.returnValue(of({}));

    authServiceSpy = jasmine.createSpyObj('AuthService', ['getAccessToken', 'getCurrentUserId']);
    authServiceSpy.getAccessToken.and.returnValue(accessToken);
    authServiceSpy.getCurrentUserId.and.returnValue('owner-1');

    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    toastSpy = jasmine.createSpyObj('ToastService', ['success', 'error']);

    TestBed.configureTestingModule({
      imports: [PricingPage],
      providers: [
        { provide: PlansApiService, useValue: plansApiSpy },
        { provide: ProfileService, useValue: profileServiceSpy },
        { provide: AuthService, useValue: authServiceSpy },
        { provide: AgenciesApiService, useValue: agenciesApiSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } }
        },
        { provide: MetaService, useValue: jasmine.createSpyObj('MetaService', ['setMeta']) },
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

  it('خطة مدفوعة: رسالة «تم استلام الطلب» لا «تم الاختيار»، لأن التفعيل ينتظر المشرف', () => {
    const component = createComponent('token-123');
    const translate = TestBed.inject(TranslateService) as jasmine.SpyObj<TranslateService>;
    translate.instant.and.callFake((key: string | string[]) => String(key));

    component.onSelectPlan(PLANS[1]);

    expect(toastSpy.success).toHaveBeenCalledWith('PRICING.MESSAGES.PLAN_REQUEST_SENT');
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
  });

  it('زائر غير مسجَّل الدخول يختار خطة مدفوعة ⇐ يذهب مباشرة لصفحة التواصل، بلا تسجيل دخول', () => {
    const component = createComponent(null);

    component.onSelectPlan(PLANS[1]);

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/kontakt'], {
      queryParams: { plan: 'premium' }
    });
  });

  it('العودة من الدخول بـ ?autoSelect=free تُكمل الاختيار تلقائيًا دون ضغطة ثانية', () => {
    const component = createComponent('token-123', { autoSelect: 'free' });

    expect(plansApiSpy.selectPlan).toHaveBeenCalledWith('free');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/property-form'], { queryParams: {} });
    expect(component).toBeTruthy();
  });

  it('autoSelect القديم يُتجاهَل إن كان المستخدم ما زال غير مسجَّل الدخول', () => {
    createComponent(null, { autoSelect: 'free' });

    expect(plansApiSpy.selectPlan).not.toHaveBeenCalled();
  });
  it('طلب خطة بانتظار المشرف يظهر على بطاقتها فقط ويختفي عند التفعيل', () => {
    const component = createComponent('token-123');
    expect(component.pendingTier()).toBeNull();

    profile$.next({ PendingPlanTier: 'premium' });
    expect(component.pendingTier()).toBe('premium');

    profile$.next({ PendingPlanTier: null });
    expect(component.pendingTier()).toBeNull();
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
});
