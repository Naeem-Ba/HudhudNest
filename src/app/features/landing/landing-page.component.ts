// ─────────────────────────────────────────────────────────
// landing-page.component.ts
//
// [هذه الجولة] تبنّي هوية "دفتر العائلة" + دعم عربي/إنكليزي/ألماني كامل:
// - كل نصوص القالب صارت مفاتيح ترجمة (translate pipe) تحت مساحة LANDING
//   في public/i18n/{ar,de,en}.json، بدل نص عربي ثابت.
// - رسائل الأخطاء وaria-label الديناميكية (تحتوي أرقامًا/متغيرات) تُبنى هنا
//   عبر TranslateService.instant مع params بدل تجميع نص خام.
// - قوائم "نوع المستخدم"/"المدينة" تستخدم LabeledOption (قيمة ثابتة تُرسَل
//   للباك-إند + مفتاح ترجمة للعرض) من lead.model.ts بدل نص عربي مباشر.
// - ميزة تبديل الشعار الفرعي أسفل العنوان الرئيسي: 3 صيغ تدور تلقائيًا
//   (taglineIndex)، مع إيقاف الدوران بالكامل إذا كان المستخدم يفضّل تقليل
//   الحركة (prefers-reduced-motion) بدل الاكتفاء بتسريع الانتقال فقط.
//
// [الجولة السابقة] قسم "أول 100 مكتب عقاري" مبني على GET /api/offers/active
// (OffersApiService) — لا عرض ثابت في الكود، القسم يختفي تلقائيًا إن لم
// يوجد عرض نشط.
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
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { interval } from 'rxjs';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { LeadService } from '../../core/services/lead.service';
import { OffersApiService } from '../../core/api/offers-api.service';
import { MetaService } from '../../core/services/meta.service';
import { SYRIA_CITY_OPTIONS, USER_TYPE_OPTIONS, UserType } from '../../core/models/lead.model';
import { Offer, formatOfferDiscount, remainingSlots } from '../../core/models/offer.model';

// ── Validator: رقم هاتف مرن يقبل سوريا والدول العربية ──
function phoneValidator(ctrl: AbstractControl): ValidationErrors | null {
  const raw   = String(ctrl.value ?? '').replace(/[\s\-().]/g, '');
  const valid = /^(\+|00)?[0-9]{7,15}$/.test(raw);
  return valid ? null : { phone: true };
}

/** عدد صيغ الشعار الفرعي المتوفرة تحت LANDING.HERO.TAGLINE_1..3 — يُبقي
 *  التدوير في .ts متزامنًا مع عدد المفاتيح الفعلي في ملفات الترجمة. */
const TAGLINE_COUNT = 3;
const TAGLINE_ROTATE_MS = 5200;

@Component({
  selector:        'app-landing-page',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [CommonModule, ReactiveFormsModule, RouterLink, TranslateModule],
  templateUrl:     './landing-page.component.html',
  styleUrls:       ['./landing-page.component.scss'],
})
export class LandingPageComponent implements OnInit {
  private readonly fb         = inject(FormBuilder);
  private readonly leadSvc    = inject(LeadService);
  private readonly offersApi  = inject(OffersApiService);
  private readonly metaSvc    = inject(MetaService);
  private readonly translate  = inject(TranslateService);
  private readonly cd         = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  // ── قوائم مساعدة للـ Template (قيمة ثابتة للباك-إند + مفتاح ترجمة للعرض) ──
  readonly userTypeOptions = USER_TYPE_OPTIONS;
  readonly cityOptions     = SYRIA_CITY_OPTIONS;
  readonly currentYear     = new Date().getFullYear();

  // ── عرض "أول 100 مكتب عقاري" — null يعني: لا عرض نشط، أخفِ القسم بالكامل ──
  readonly activeOffer = signal<Offer | null>(null);

  // ── حالات الـ Form ──
  readonly formState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  /** يُضبط عند النجاح فقط إذا طُلب عرض فعلاً — يُستخدم لعرض رسالة نجاح
   *  صادقة تفرّق بين "انضممت للعرض" و"سُجِّلت، لكن العرض لم يعد متاحًا". */
  readonly offerAppliedOnSuccess = signal<boolean | null>(null);
  errorMessage = '';

  // ── تتبع FAQ المفتوح ──
  readonly openFaqIndex = signal<number | null>(null);

  // ── تبديل الشعار الفرعي في الـ Hero ──
  readonly taglineIndex = signal(0);

  // ── منع الإرسال المتكرر ──
  private submitting = false;

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

  ngOnInit(): void {
    this.metaSvc.setLandingMeta();

    // فشل تحميل العرض (شبكة، 204 لا يوجد عرض، ...) لا يجب أن يكسر بقية
    // الصفحة أبدًا — OffersApiService.getActiveOffer() يُرجع null في كل
    // هذه الحالات، فالقسم يختفي بهدوء بدل إظهار خطأ.
    this.offersApi.getActiveOffer()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(offer => {
        this.activeOffer.set(offer);
        this.cd.markForCheck();
      });

    this.startTaglineRotation();
  }

  /** لا تدوير على الإطلاق إذا فضّل المستخدم تقليل الحركة — وليس فقط
   *  انتقالًا أسرع بينها؛ تغيّر محتوى متكرر بلا داعٍ يبقى غير مرغوب. */
  private startTaglineRotation(): void {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    interval(TAGLINE_ROTATE_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.taglineIndex.update(i => (i + 1) % TAGLINE_COUNT);
        this.cd.markForCheck();
      });
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
    this.form.patchValue({ userType: 'agency' });
    this.scrollToForm();
  }

  offerDiscountText(offer: Offer): string {
    return formatOfferDiscount(offer);
  }

  offerRemainingSlots(offer: Offer): number | null {
    return remainingSlots(offer);
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
