import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs';

import { ContactService } from '../../core/api/contact.service';
import { ProfileService } from '../../core/api/profile.service';
import { ToastService } from '../../shared/services/toast.service';
import { PlanTier } from '../../core/models/subscription-plan.model';
import { PageMetaService } from '../../core/services/page-meta.service';

/** Tiers accepted from ?plan=. Anything else is ignored rather than echoed back. */
const PLAN_TIERS: readonly PlanTier[] = ['free', 'basic', 'premium', 'elite'];

@Component({
  selector: 'app-kontakt',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss'
})
export class KontaktComponent implements OnInit {
  model = {
    Name: '',
    Email: '',
    Subject: '',
    Message: ''
  };

  sending = false;
  messageText = '';
  success = false;
  submitted = false;

  /**
   * ✅ إضافة: بوابة "اطلب أن تصبح مزوّد خدمة" — الباك اند يُبقي إنشاء ServiceProvider
   * (ServiceProvidersController.Create) صلاحية Admin فقط عمداً (تسجيل موثَّق لا ذاتي)،
   * فلا يوجد ولا ينبغي أن يوجد Endpoint لإنشاء ذاتي. بدل بناء تدفّق موافقة/رفض جديد
   * بالكامل، هذا يعيد استخدام نموذج التواصل الموجود فعلاً (ContactController، الذي
   * تراجعه الإدارة أصلاً عبر GET /api/contact) بنفس آلية Subject Prefill المستخدمة
   * أعلاه لروابط /pricing?plan=. لا حقول قاعدة بيانات جديدة، لا Endpoint جديد.
   */
  messagePlaceholderKey = 'KONTAKT.message_placeholder';

  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  /** Tracks whatever this component itself last wrote into model.Subject, so a language
   * switch can refresh a still-untouched prefill without ever overwriting text the visitor
   * typed themselves. */
  private lastAutoSubject: string | null = null;

  constructor(
    private readonly contactService: ContactService,
    private readonly profileService: ProfileService,
    private readonly translate: TranslateService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute
  ) {}

  /**
   * The /pricing CTAs link here as /kontakt?plan=<tier>, and the "become a provider" CTAs
   * as /kontakt?intent=service-provider. Prefill the subject so the reason the visitor came
   * is not lost on the way over. Re-applied on every language switch (onLangChange) — a
   * translate.instant() snapshot taken once in ngOnInit would otherwise freeze the prefilled
   * Subject in whatever language was active on load, even after the visitor switches to
   * Arabic/English/German, while everything else on the page (including this same field's
   * placeholder) updates immediately.
   */
  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.CONTACT', '/kontakt', this.destroyRef);
    this.applyQueryParamPrefill();

    this.translate.onLangChange
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyQueryParamPrefill());
  }

  private applyQueryParamPrefill(): void {
    const intent = this.route.snapshot.queryParamMap.get('intent');
    if (intent === 'service-provider') {
      this.setAutoSubject(this.translate.instant('KONTAKT.SERVICE_PROVIDER_SUBJECT'));
      this.messagePlaceholderKey = 'KONTAKT.SERVICE_PROVIDER_MESSAGE_PLACEHOLDER';

      // Best-effort prefill for an already logged-in visitor — profile$ is a cached,
      // BehaviorSubject-backed stream (already populated on login), so take(1) reads
      // whatever is there right now without triggering its own HTTP call.
      this.profileService.profile$.pipe(take(1)).subscribe(profile => {
        if (!profile) {
          return;
        }
        this.model.Email = profile.Email ?? this.model.Email;
        this.model.Name = profile.DisplayName || profile.Name || this.model.Name;
      });

      return;
    }

    const raw = (this.route.snapshot.queryParamMap.get('plan') ?? '').toLowerCase();
    if (!PLAN_TIERS.includes(raw as PlanTier)) {
      return;
    }

    const planKey = 'PRICING.' + raw.toUpperCase() + '.NAME';
    this.translate.get([planKey, 'KONTAKT.PLAN_SUBJECT']).subscribe(values => {
      this.setAutoSubject(
        this.translate.instant('KONTAKT.PLAN_SUBJECT', { plan: values[planKey] })
      );
    });
  }

  /** Only overwrites model.Subject when it still holds our own last auto-fill (untouched by
   * the visitor) or is empty — never clobbers something the visitor actually typed. */
  private setAutoSubject(value: string): void {
    if (this.model.Subject === '' || this.model.Subject === this.lastAutoSubject) {
      this.model.Subject = value;
    }
    this.lastAutoSubject = value;
  }

  onSubmit(form: NgForm): void {
    this.submitted = true;
    form.control.markAllAsTouched();

    if (form.invalid) {
      this.success = false;
      this.messageText = this.translate.instant('KONTAKT.error_validation');
      this.toast.error(this.messageText);
      return;
    }

    this.sending = true;
    this.messageText = '';

    this.contactService.sendContact(this.model).subscribe({
      next: () => {
        this.sending = false;
        this.success = true;
        this.submitted = false;
        this.messageText = this.translate.instant('KONTAKT.success_msg');
        this.toast.success(this.messageText);
        form.resetForm();
      },
      error: err => {
        console.error('Kontakt senden Fehler', err);
        this.sending = false;
        this.success = false;
        this.messageText = this.translate.instant('KONTAKT.error_msg');
        this.toast.error(this.messageText);
      }
    });
  }
}
