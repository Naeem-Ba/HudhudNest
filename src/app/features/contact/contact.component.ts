import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs';

import { ContactService } from '../../core/api/contact.service';
import { ProfileService } from '../../core/api/profile.service';
import { ToastService } from '../../shared/services/toast.service';
import { PlanTier } from '../../core/models/subscription-plan.model';
import { PageMetaService } from '../../core/services/page-meta.service';

const REQUEST_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tiers accepted from ?plan=. Anything else is ignored rather than echoed back. */
const PLAN_TIERS: readonly PlanTier[] = ['free', 'basic', 'premium', 'elite'];

export type ContactReason = 'general' | 'plans' | 'support' | 'provider' | 'privacy' | 'partnership';

export const CONTACT_REASONS: readonly { code: ContactReason; subject: string; labelKey: string; placeholderKey: string }[] = [
  { code: 'general', subject: 'Allgemeine Frage', labelKey: 'KONTAKT.REASONS.GENERAL.LABEL', placeholderKey: 'KONTAKT.REASONS.GENERAL.PLACEHOLDER' },
  { code: 'plans', subject: 'Pakete, Zahlung & Rechnung', labelKey: 'KONTAKT.REASONS.PLANS.LABEL', placeholderKey: 'KONTAKT.REASONS.PLANS.PLACEHOLDER' },
  { code: 'support', subject: 'Problem mit Konto oder Inserat', labelKey: 'KONTAKT.REASONS.SUPPORT.LABEL', placeholderKey: 'KONTAKT.REASONS.SUPPORT.PLACEHOLDER' },
  { code: 'provider', subject: 'Aufnahme als Dienstleister', labelKey: 'KONTAKT.REASONS.PROVIDER.LABEL', placeholderKey: 'KONTAKT.REASONS.PROVIDER.PLACEHOLDER' },
  { code: 'privacy', subject: 'Datenschutz & Datenanfrage', labelKey: 'KONTAKT.REASONS.PRIVACY.LABEL', placeholderKey: 'KONTAKT.REASONS.PRIVACY.PLACEHOLDER' },
  { code: 'partnership', subject: 'Zusammenarbeit, Büros & Presse', labelKey: 'KONTAKT.REASONS.PARTNERSHIP.LABEL', placeholderKey: 'KONTAKT.REASONS.PARTNERSHIP.PLACEHOLDER' }
];

@Component({
  selector: 'app-kontakt',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './contact.component.html',
  styleUrl: './contact.component.scss'
})
export class KontaktComponent implements OnInit {
  /** Short FAQ under the form; wording in SITE.FAQ. */
  readonly faqItems = [1, 2, 3, 4].map(n => ({ q: `SITE.FAQ.Q${n}`, a: `SITE.FAQ.A${n}` }));

  /** Reasons offered in the select. Order = order shown. The German label is what the admin inbox
   * receives as the message subject, so the team can sort by reason whatever language the visitor used. */
  readonly reasons = CONTACT_REASONS;

  model = {
    Name: '',
    Email: '',
    Subject: '',
    Message: ''
  };

  /** Current reason; drives the placeholder, the hint and the subject that is sent. */
  reason: ContactReason = 'general';

  /** Tier from ?plan= (validated), appended to the subject so the team sees which plan it is about. */
  private planTier: PlanTier | null = null;

  sending = false;
  messageText = '';
  success = false;
  submitted = false;

  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  constructor(
    private readonly contactService: ContactService,
    private readonly profileService: ProfileService,
    private readonly translate: TranslateService,
    private readonly toast: ToastService,
    private readonly route: ActivatedRoute
  ) {}

  /** The visitor sees the application form instead of a free message for provider requests. */
  get serviceProviderIntent(): boolean {
    return this.reason === 'provider';
  }

  get messagePlaceholderKey(): string {
    return CONTACT_REASONS.find(r => r.code === this.reason)?.placeholderKey ?? '';
  }

  /**
   * Links from elsewhere in the app arrive with the reason already known:
   *   /kontakt?reason=<code>            explicit (payment pages, footer links)
   *   /kontakt?plan=<tier>              pricing CTAs  -> plans
   *   /kontakt?ref=<planRequestId>      checkout      -> plans (+ reference quoted in the message)
   *   /kontakt?intent=service-provider  older published links -> provider
   */
  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.CONTACT', '/kontakt', this.destroyRef);
    this.applyQueryParams();
    this.prefillPlanReference();
  }

  private applyQueryParams(): void {
    const q = this.route.snapshot.queryParamMap;
    const explicit = (q.get('reason') ?? '').toLowerCase();
    const plan = (q.get('plan') ?? '').toLowerCase();

    if (PLAN_TIERS.includes(plan as PlanTier)) {
      this.planTier = plan as PlanTier;
    }

    if (CONTACT_REASONS.some(r => r.code === explicit)) {
      this.reason = explicit as ContactReason;
    } else if (q.get('intent') === 'service-provider') {
      this.reason = 'provider';
    } else if (this.planTier || REQUEST_REF.test(q.get('ref') ?? '')) {
      this.reason = 'plans';
    }

    if (this.reason === 'provider') {
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
    }
  }

  /**
   * /pricing hands over ?ref=<planRequestId> after a paid plan was recorded. Quote it as the first
   * line of the (still empty) message so whoever reads the enquiry can match it to the pending
   * request. Written once -- never over text the visitor typed -- and only when it is a real GUID,
   * so a crafted link cannot plant arbitrary text in the form.
   */
  private prefillPlanReference(): void {
    const ref = this.route.snapshot.queryParamMap.get('ref') ?? '';
    if (!REQUEST_REF.test(ref) || this.model.Message !== '') {
      return;
    }

    this.translate.get('KONTAKT.PLAN_REF_LINE', { ref }).subscribe(line => {
      if (this.model.Message === '') {
        this.model.Message = `${line}\n\n`;
      }
    });
  }

  /** The subject the team receives: always the German reason label, plus the plan tier when known. */
  buildSubject(): string {
    const label = CONTACT_REASONS.find(r => r.code === this.reason)?.subject ?? '';
    return this.reason === 'plans' && this.planTier ? `${label} (${this.planTier})` : label;
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

    this.contactService.sendContact({ ...this.model, Subject: this.buildSubject() }).subscribe({
      next: () => {
        this.sending = false;
        this.success = true;
        this.submitted = false;
        this.messageText = this.translate.instant('KONTAKT.success_msg');
        this.toast.success(this.messageText);
        form.resetForm();
        this.model = { Name: '', Email: '', Subject: '', Message: '' };
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
