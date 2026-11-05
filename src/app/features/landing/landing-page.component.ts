// ─────────────────────────────────────────────────────────
// landing-page.component.ts
//
// إعادة تصميم صفحة الهبوط التسويقية (2026-11-05):
// - الصفحة مسار مستقل خارج LayoutComponent (انظر app.routes.ts) فلا يظهر الـ Navbar الرئيسي؛
//   شريط علوي نحيف يحمل الشعار وزر «تصفّح الموقع» ومبدّل اللغة فقط.
// - كل النصوص مفاتيح ترجمة تحت LANDING في public/i18n/{ar,de,en}.json.
// - لا أرقام ولا عدّادات جغرافية ولا أعداد مدن: الرؤية سوريا كلّها والانطلاق تدريجي.
// - قسم عرض «أول 100 مكتب» (GET /api/offers/active) والنموذج وتتبّع الأحداث كما كانت دون تغيير منطقي.
// ─────────────────────────────────────────────────────────
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { isNativeApp } from '../../core/native/is-native-app';
import { LangCode, LanguageService } from '../../core/services/language.service';

import { LeadService } from '../../core/services/lead.service';
import { OffersApiService } from '../../core/api/offers-api.service';
import { MarketingEventsApiService } from '../../core/api/marketing-events-api.service';
import { MetaService } from '../../core/services/meta.service';
import { PageMetaService } from '../../core/services/page-meta.service';
import { SYRIA_CITY_OPTIONS, USER_TYPE_OPTIONS, UserType } from '../../core/models/lead.model';
import { Offer } from '../../core/models/offer.model';
import { numberLocaleFor } from '../../core/i18n/supported-preferences';

// ── Validator: رقم هاتف مرن يقبل سوريا والدول العربية ──
function phoneValidator(ctrl: AbstractControl): ValidationErrors | null {
  const raw   = String(ctrl.value ?? '').replace(/[\s\-().]/g, '');
  const valid = /^(\+|00)?[0-9]{7,15}$/.test(raw);
  return valid ? null : { phone: true };
}

/** دائرة كمسار SVG واحد (لتبقى كل الأيقونات مصفوفات مسارات بسيطة). */
const circle = (cx: number, cy: number, r: number): string =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** أيقونات خطية 24×24 (stroke) — لا مكتبة أيقونات إضافية. */
export const LANDING_ICONS = {
  home:     ['M3 11 12 4l9 7v9H3z', 'M9 20v-6h6v6'],
  key:      [circle(8, 15, 4), 'm11 12 9-9M16 7l3 3'],
  bed:      ['M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6'],
  trend:    ['M3 17l6-6 4 4 8-8M15 7h6v6'],
  plus:     ['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z', 'M12 8v8M8 12h8'],
  briefcase:['M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z', 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18'],
  search:   [circle(11, 11, 7), 'm20 20-3.5-3.5'],
  list:     ['M6 4h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z', 'M3 10h18M8 15h5'],
  chat:     ['M4 5h16v11H9l-5 4z'],
  tag:      ['M3 12V4h8l9 9-8 8z', circle(7.5, 8.5, 1.2)],
  globe:    [circle(12, 12, 9), 'M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18'],
  heart:    ['M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z'],
  pin:      ['M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z', circle(12, 10, 2.5)],
  check:    ['M5 12.5l4.5 4.5L19 7.5'],
} as const;
export type LandingIcon = keyof typeof LANDING_ICONS;

interface LandingLink { key: string; icon: LandingIcon; link?: string; query?: Record<string, string> }

@Component({
  selector:        'app-landing-page',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [CommonModule, ReactiveFormsModule, RouterLink, TranslateModule],
  templateUrl:     './landing-page.component.html',
  styleUrls:       ['./landing-page.component.scss'],
})
export class LandingPageComponent implements OnInit {
  readonly icons = LANDING_ICONS;
  private readonly fb         = inject(FormBuilder);
  private readonly leadSvc    = inject(LeadService);
  private readonly offersApi  = inject(OffersApiService);
  private readonly events     = inject(MarketingEventsApiService);
  private readonly route      = inject(ActivatedRoute);
  private readonly metaSvc    = inject(MetaService);
  private readonly pageMeta   = inject(PageMetaService);
  private readonly translate  = inject(TranslateService);
  private readonly cd         = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly language   = inject(LanguageService);

  // ── قوائم مساعدة للـ Template (قيمة ثابتة للباك-إند + مفتاح ترجمة للعرض) ──
  readonly userTypeOptions = USER_TYPE_OPTIONS;
  readonly cityOptions     = SYRIA_CITY_OPTIONS;
  readonly currentYear     = new Date().getFullYear();
  /** Hidden inside the installed app, where "download the app" would be pointless. */
  readonly showDownloadLink = !isNativeApp();

  // ── عرض "أول 100 مكتب عقاري" — null يعني: لا عرض نشط، أخفِ القسم بالكامل ──
  readonly activeOffer = signal<Offer | null>(null);

  /** loading → هيكل تحميل؛ ready → البطاقة؛ empty → لا عروض منشورة؛ error → تعذّر التحميل (مع إعادة محاولة). */
  readonly offerState = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');

  // ── حالات الـ Form ──
  readonly formState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  /** يُضبط عند النجاح فقط إذا طُلب عرض فعلاً — يُستخدم لعرض رسالة نجاح
   *  صادقة تفرّق بين "انضممت للعرض" و"سُجِّلت، لكن العرض لم يعد متاحًا". */
  readonly offerAppliedOnSuccess = signal<boolean | null>(null);
  errorMessage = '';

  // ── تتبع FAQ المفتوح ──
  readonly openFaqIndex = signal<number | null>(null);

  // ── منع الإرسال المتكرر ──
  private submitting = false;
  private viewTracked = false;

  // ── Reactive Form ──
  readonly form = this.fb.nonNullable.group({
    fullName:        ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    phoneOrWhatsapp: ['', [Validators.required, phoneValidator]],
    userType:        ['' as UserType, Validators.required],
    city:            ['', Validators.required],
    notes:           ['', Validators.maxLength(300)],
  });

  // ── مفاتيح أسئلة FAQ الشائعة — النص الفعلي في LANDING.FAQ.ITEMS.* ──
  readonly faqKeys = ['LAUNCH', 'FREE', 'OWNER', 'AGENCY', 'VERIFIED', 'SYRIA_ONLY'];

  /** مصفوفة ثابتة (لا تُعاد إنشاؤها كل دورة CD) لعناصر قسم المشكلة/الحل —
   *  5 عناصر لكل عمود، النص الفعلي في LANDING.PROBLEM_SOLUTION.*_ITEMS. */
  readonly psItemIndices = [1, 2, 3, 4, 5];

  /** «ماذا يمكنك أن تفعل؟» — كل بطاقة تقود إلى المسار الفعلي المقابل لها في التطبيق. */
  readonly uses: readonly LandingLink[] = [
    { key: 'BUY',      icon: 'home',      link: '/properties', query: { listingType: 'ForSale' } },
    { key: 'RENT',     icon: 'key',       link: '/properties', query: { listingType: 'ForRent' } },
    { key: 'SHORT',    icon: 'bed',       link: '/short-stay' },
    { key: 'INVEST',   icon: 'trend',     link: '/investments' },
    { key: 'PUBLISH',  icon: 'plus',      link: '/property-form' },
    { key: 'SERVICES', icon: 'briefcase', link: '/services' },
  ];

  /** بطاقات الميزات — كلها ميزات موجودة فعلًا (تحقق في الكود، انظر تقرير landing-page/). */
  readonly features: readonly LandingLink[] = [
    { key: 'SEARCH',   icon: 'search', link: '/properties' },
    { key: 'INFO',     icon: 'list' },
    { key: 'PRICE',    icon: 'tag',    link: '/price-estimate' },
    { key: 'LANGS',    icon: 'globe' },
    { key: 'SERVICES', icon: 'briefcase', link: '/services' },
    { key: 'SAVE',     icon: 'heart' },
    { key: 'MAP',      icon: 'pin',    link: '/map' },
    { key: 'CONTACT',  icon: 'chat' },
  ];

  readonly serviceChips = ['VERIFICATION', 'VALUATION', 'INSPECTION', 'PHOTOGRAPHY', 'MANAGEMENT', 'LEGAL', 'ENGINEERING', 'MAINTENANCE'];
  readonly officePoints = [1, 2, 3, 4];
  readonly searchPoints = [1, 2, 3, 4, 5];

  readonly languages = this.language.getLanguages();
  readonly currentLang = signal<LangCode>(this.language.getCurrent());

  setLanguage(code: LangCode): void {
    this.language.use(code);
    this.currentLang.set(code);
  }

  /** نقرة CTA عامة (غير مرتبطة بعرض): حدث CtaClick الموجود أصلًا — بلا بيانات شخصية. */
  trackCta(): void {
    this.events.track('CtaClick', { campaign: this.campaign() });
  }

  ngOnInit(): void {
    this.pageMeta.applyTranslated('LANDING.SEO', '/landing', this.destroyRef);

    this.loadOffer();
  }

  /** فشل التحميل لا يكسر بقية الصفحة: يظهر قسم العروض فقط بحالة خطأ وزر إعادة محاولة. */
  loadOffer(): void {
    this.offerState.set('loading');
    this.offersApi.getActiveOfferState()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        const offerId = state.status === 'ready' ? state.offer.id : undefined;
        if (state.status === 'ready') {
          this.activeOffer.set(state.offer);
          this.metaSvc.setLandingMeta({ offerName: state.offer.name, offerDescription: state.offer.description });
        } else {
          this.activeOffer.set(null);
        }
        // مشاهدة واحدة لكل زيارة: إعادة المحاولة لا تُحتسب مشاهدة جديدة.
        if (!this.viewTracked) {
          this.viewTracked = true;
          this.events.track('PageView', { offerId, campaign: this.campaign() });
        }
        this.offerState.set(state.status);
        this.cd.markForCheck();
      });
  }

  /** وسم الحملة القادم من رابط المشاركة (utm_campaign) — للإسناد فقط، بلا بيانات شخصية. */
  private campaign(): string | null {
    return this.route.snapshot.queryParamMap.get('utm_campaign');
  }

  toggleFaq(index: number): void {
    this.openFaqIndex.set(this.openFaqIndex() === index ? null : index);
  }

  scrollToForm(): void {
    const el = document.getElementById('waitlist-form');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** زر CTA داخل قسم العرض: يهيّئ النموذج لمكتب عقاري وينتقل إليه مباشرة —
   *  offerId الفعلي يُرسَل تلقائيًا من submitForm() عبر activeOffer(). */
  scrollToFormForOffer(): void {
    this.events.track('CtaClick', { offerId: this.activeOffer()?.id, campaign: this.campaign() });
    this.form.patchValue({ userType: 'agency' });
    this.scrollToForm();
  }

  /** نص الخصم بلغة الواجهة الحالية (مفاتيح OFFER_COMMON.*). */
  offerDiscountText(offer: Offer): string {
    switch (offer.discountType) {
      case 'Percentage':
        return this.translate.instant('OFFER_COMMON.DISCOUNT_PERCENT', { value: offer.discountValue });
      case 'FixedAmountUsd':
        return this.translate.instant('OFFER_COMMON.DISCOUNT_FIXED_USD', { value: offer.discountValue });
      case 'FreeMonths':
        return this.translate.instant(
          offer.discountValue === 1 ? 'OFFER_COMMON.DISCOUNT_FREE_MONTH' : 'OFFER_COMMON.DISCOUNT_FREE_MONTHS',
          { value: offer.discountValue },
        );
      default:
        return '';
    }
  }

  /** تاريخ انتهاء العرض بلغة الواجهة، أو null إن لم يكن له تاريخ ثابت. */
  offerEndsOn(offer: Offer): string | null {
    if (!offer.endsAtUtc) return null;
    const lang = this.translate.currentLang || this.translate.defaultLang || 'ar';
    let date: string;
    try {
      date = new Intl.DateTimeFormat(numberLocaleFor(lang), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(offer.endsAtUtc));
    } catch {
      date = offer.endsAtUtc.slice(0, 10);
    }
    return this.translate.instant('LANDING.OFFER.ENDS_ON', { date });
  }

  /** نص aria-label لشريط تقدّم العرض — "تم الانضمام: X من أصل Y". */
  offerProgressAriaLabel(offer: Offer, max: number): string {
    return this.translate.instant('LANDING.OFFER.PROGRESS_ARIA', {
      count: offer.redeemedCount,
      max,
    });
  }

  /** نص وصفي أسفل شريط التقدّم — "انضمّ X من أصل Y مكتب حتى الآن". */
  offerProgressLabel(offer: Offer, max: number): string {
    return this.translate.instant('LANDING.OFFER.PROGRESS_LABEL', {
      count: offer.redeemedCount,
      max,
    });
  }

  submitForm(): void {
    if (this.submitting || this.formState() === 'loading') return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting = true;
    this.formState.set('loading');
    this.errorMessage = '';
    this.offerAppliedOnSuccess.set(null);

    const { fullName, phoneOrWhatsapp, userType, city, notes } = this.form.getRawValue();
    const offerId = this.activeOffer()?.id;

    this.leadSvc
      .submitLead({ fullName, phoneOrWhatsapp, userType, city, notes, offerId })
      .subscribe({
        next: res => {
          this.formState.set('success');
          // undefined (لم يُطلب عرض أصلاً) يبقى null — الفرق بين "لا يوجد
          // عرض" و"طُلب عرض لكنه لم يعد متاحًا" مهم لرسالة النجاح.
          this.offerAppliedOnSuccess.set(offerId ? !!res.offerApplied : null);
          this.submitting = false;
          this.cd.markForCheck();
        },
        error: (message: string) => {
          this.formState.set('error');
          this.errorMessage = message;
          this.submitting   = false;
          this.cd.markForCheck();
        },
      });
  }

  isFieldInvalid(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl && ctrl.invalid && ctrl.touched);
  }

  getError(field: string): string {
    const ctrl = this.form.get(field);
    if (!ctrl || !ctrl.errors) return '';
    const e = ctrl.errors;
    if (e['required'])  return this.translate.instant('LANDING.FORM.ERRORS.REQUIRED');
    if (e['minlength']) {
      return this.translate.instant('LANDING.FORM.ERRORS.MINLENGTH', {
        min: e['minlength'].requiredLength,
      });
    }
    if (e['maxlength']) return this.translate.instant('LANDING.FORM.ERRORS.MAXLENGTH');
    if (e['phone'])     return this.translate.instant('LANDING.FORM.ERRORS.PHONE');
    return this.translate.instant('LANDING.FORM.ERRORS.GENERIC');
  }

  resetForm(): void {
    this.form.reset();
    this.formState.set('idle');
    this.errorMessage = '';
    this.submitting   = false;
    this.offerAppliedOnSuccess.set(null);
  }
}
