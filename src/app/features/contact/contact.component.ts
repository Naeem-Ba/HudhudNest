import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs';

import { ContactService } from '../../core/api/contact.service';
import { ProfileService } from '../../core/api/profile.service';
import { ToastService } from '../../shared/services/toast.service';
import { PlanTier } from '../../core/models/subscription-plan.model';

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

  constructor(
    private readonly contactService: ContactService,
    private readonly profileService: ProfileService,
    private readonly translate: TranslateService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute
  ) {}

  /**
   * The /pricing CTAs link here as /kontakt?plan=<tier>. Prefill the subject so the
   * chosen plan is not lost on the way over — without it the user lands on an empty
   * form and has to restate why they came. Payment is not wired up yet, so this
   * contact route is the real end of the subscription flow today.
   */
  ngOnInit(): void {
    const intent = this.route.snapshot.queryParamMap.get('intent');
    if (intent === 'service-provider') {
      this.model.Subject = this.translate.instant('KONTAKT.SERVICE_PROVIDER_SUBJECT');
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
      this.model.Subject = this.translate.instant('KONTAKT.PLAN_SUBJECT', {
        plan: values[planKey]
      });
    });
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
