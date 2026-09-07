// ─────────────────────────────────────────────────────────
// landing-page.component.ts
// [مراجعة] لا يوجد خلل وظيفي يستدعي تعديلاً هنا. الكود يستخدم
// Signals + OnPush + Reactive Forms بشكل صحيح. أُعيد فقط لاكتمال
// التسليم، مطابق تماماً لما أرسلته.
// ─────────────────────────────────────────────────────────
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { LeadService } from '../../core/services/lead.service';
import { MetaService } from '../../core/services/meta.service';
import { SYRIA_CITIES, USER_TYPE_LABELS, UserType } from '../../core/models/lead.model';

// ── Validator: رقم هاتف مرن يقبل سوريا والدول العربية ──
function phoneValidator(ctrl: AbstractControl): ValidationErrors | null {
  const raw   = String(ctrl.value ?? '').replace(/[\s\-().]/g, '');
  const valid = /^(\+|00)?[0-9]{7,15}$/.test(raw);
  return valid ? null : { phone: true };
}

@Component({
  selector:        'app-landing-page',
  standalone:      true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports:         [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl:     './landing-page.component.html',
  styleUrls:       ['./landing-page.component.scss'],
})
export class LandingPageComponent implements OnInit, OnDestroy {
  private readonly fb        = inject(FormBuilder);
  private readonly leadSvc   = inject(LeadService);
  private readonly metaSvc   = inject(MetaService);
  private readonly cd        = inject(ChangeDetectorRef);

  // ── قوائم مساعدة للـ Template ──
  readonly userTypeOptions = Object.entries(USER_TYPE_LABELS) as [UserType, string][];
  readonly cities          = SYRIA_CITIES;
  readonly currentYear     = new Date().getFullYear();

  // ── حالات الـ Form ──
  readonly formState = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  errorMessage = '';

  // ── تتبع FAQ المفتوح ──
  readonly openFaqIndex = signal<number | null>(null);

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

  // ── FAQ بيانات ──
  readonly faqs = [
    {
      q: 'متى سيتم إطلاق المنصة؟',
      a: 'نحن في مرحلة بناء النسخة التجريبية (MVP). المسجّلون في قائمة الانتظار سيكونون أول من يحصل على دعوة الإطلاق.',
    },
    {
      q: 'هل الخدمة مجانية في البداية؟',
      a: 'نعم، نخطط لأن تكون الخدمة مجانية في مرحلتها الأولى للباحثين وأصحاب العقارات، مع إمكانية إضافة خطط مميزة لاحقاً.',
    },
    {
      q: 'هل يمكن لأصحاب العقارات التسجيل الآن؟',
      a: 'بالتأكيد. سجّل اهتمامك عبر النموذج واختر "أريد نشر عقاري"، وسنتواصل معك عند فتح باب النشر.',
    },
    {
      q: 'هل يمكن للمكاتب العقارية إضافة عروضها؟',
      a: 'نعم، نرحب بالمكاتب العقارية. اختر "مكتب عقاري" في النموذج وسنتواصل معك بتفاصيل الشراكة.',
    },
    {
      q: 'هل العقارات موثّقة وآمنة؟',
      a: 'نعمل على توفير معلومات أوضح وتقليل الإعلانات العشوائية. المنصة في مرحلة تطوير، وآليات التحقق ستتحسن تدريجياً. كما هو الحال في أي صفقة عقارية، ننصح دائماً بالتحقق الشخصي قبل اتخاذ أي قرار.',
    },
    {
      q: 'هل المنصة مخصصة لسوريا فقط؟',
      a: 'نبدأ من سوريا، لكن التصميم يدعم التوسع إلى أسواق عربية وعالمية لاحقاً، خاصةً لخدمة المغتربين السوريين في كل مكان.',
    },
  ];

  ngOnInit(): void {
    this.metaSvc.setLandingMeta();
  }

  ngOnDestroy(): void {
    // تنظيف إذا أُضيفت subscriptions لاحقاً
  }

  toggleFaq(index: number): void {
    this.openFaqIndex.set(this.openFaqIndex() === index ? null : index);
  }

  scrollToForm(): void {
    const el = document.getElementById('waitlist-form');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  submitForm(): void {
    if (this.submitting || this.formState() === 'loading') return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.submitting = true;
    this.formState.set('loading');
    this.errorMessage = '';

    const { fullName, phoneOrWhatsapp, userType, city, notes } = this.form.getRawValue();

    this.leadSvc
      .submitLead({ fullName, phoneOrWhatsapp, userType, city, notes })
      .subscribe({
        next: () => {
          this.formState.set('success');
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
    if (e['required'])  return 'هذا الحقل مطلوب.';
    if (e['minlength']) return `الاسم قصير جداً (الحد الأدنى ${e['minlength'].requiredLength} حروف).`;
    if (e['maxlength']) return 'تجاوزت الحد الأقصى للنص.';
    if (e['phone'])     return 'رقم الهاتف غير صحيح. مثال: 0933123456 أو +963933123456';
    return 'قيمة غير صحيحة.';
  }

  resetForm(): void {
    this.form.reset();
    this.formState.set('idle');
    this.errorMessage = '';
    this.submitting   = false;
  }
}
