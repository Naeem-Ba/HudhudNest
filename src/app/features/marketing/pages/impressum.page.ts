import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageService } from '../../../core/services/language.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { CONTROLLER_IDENTITY, OperatorField, missingOperatorFields } from '../../legal/controller-identity';

interface Row {
  labelKey: string;
  value: string | null;
  /** A value the law needs; shown as "not provided yet" while it is missing. */
  mandatory: boolean;
  /** Shown as "not appointed" while missing (an office that may not be required). */
  appointment?: boolean;
}

/**
 * Impressum (provider identification, § 5 DDG / § 18 MStV and similar rules), in every UI language, filled ONLY from
 * features/legal/controller-identity.ts. Values the owner has not confirmed are not invented: they are listed as
 * missing, and a notice at the top says the provider information is incomplete. `npm run check:legal` fails while
 * any mandatory field is missing, so this page cannot be declared complete for a production launch.
 */
@Component({
  selector: 'app-impressum-page',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page.scss',
  template: `
    <div class="wrap page legal impressum">
      <h1>{{ 'IMPRINT.TITLE' | translate }}</h1>
      <p class="lead">{{ 'IMPRINT.INTRO' | translate }}</p>

      @if (missing.length > 0) {
        <section class="impressum__notice" role="note" data-testid="impressum-incomplete">
          <h2>{{ 'IMPRINT.INCOMPLETE_TITLE' | translate }}</h2>
          <p>{{ 'IMPRINT.INCOMPLETE_BODY' | translate }}</p>
          <ul>
            @for (field of missing; track field) {
              <li>{{ fieldLabel[field] | translate }}</li>
            }
          </ul>
        </section>
      }

      <h2>{{ 'IMPRINT.PROVIDER' | translate }}</h2>
      <dl class="impressum__list">
        @for (row of providerRows(); track row.labelKey) {
          <dt>{{ row.labelKey | translate }}</dt>
          <dd [class.impressum__missing]="!row.value">
            {{ row.value ?? ((row.appointment ? 'IMPRINT.NOT_APPOINTED' : 'IMPRINT.NOT_PROVIDED') | translate) }}
          </dd>
        }
      </dl>

      <h2>{{ 'IMPRINT.CONTACT' | translate }}</h2>
      <dl class="impressum__list">
        <dt>{{ 'IMPRINT.SUPPORT' | translate }}</dt>
        <dd><a [href]="'mailto:' + identity.emails.support">{{ identity.emails.support }}</a></dd>
        <dt>{{ 'IMPRINT.LEGAL' | translate }}</dt>
        <dd><a [href]="'mailto:' + identity.emails.legal">{{ identity.emails.legal }}</a></dd>
        <dt>{{ 'IMPRINT.PRIVACY' | translate }}</dt>
        <dd><a [href]="'mailto:' + identity.emails.privacy">{{ identity.emails.privacy }}</a></dd>
        <dt>{{ 'IMPRINT.SECURITY' | translate }}</dt>
        <dd><a [href]="'mailto:' + identity.emails.security">{{ identity.emails.security }}</a></dd>
        <dt>{{ 'IMPRINT.WEBSITE' | translate }}</dt>
        <dd><a [href]="identity.website">{{ identity.website }}</a></dd>
      </dl>

      <h2>{{ 'IMPRINT.REGISTER' | translate }}</h2>
      <dl class="impressum__list">
        @for (row of registerRows; track row.labelKey) {
          <dt>{{ row.labelKey | translate }}</dt>
          <dd [class.impressum__missing]="!row.value">{{ row.value ?? ('IMPRINT.NONE_KNOWN' | translate) }}</dd>
        }
      </dl>

      <p class="impressum__links">
        <a routerLink="/privacy-policy">{{ 'LEGAL_LINKS.PRIVACY' | translate }}</a> ·
        <a routerLink="/terms-of-service">{{ 'LEGAL_LINKS.TERMS' | translate }}</a> ·
        <a routerLink="/account-deletion">{{ 'LEGAL_LINKS.DELETION' | translate }}</a>
      </p>
    </div>
  `,
  styles: [
    `
      .impressum__notice { margin-block-start: 1.5rem; padding: 1rem 1.25rem; border-radius: 14px; border: 1px solid var(--warning-border, #f59e0b); background: var(--warning-bg, rgba(245, 158, 11, .1)); }
      .impressum__notice h2 { margin: 0; font-size: 1.05rem; }
      .impressum__notice ul { margin: .5rem 0 0; padding-inline-start: 1.25rem; }
      .impressum__list { display: grid; grid-template-columns: minmax(9rem, max-content) 1fr; gap: .5rem 1.25rem; margin: 1rem 0 0; }
      .impressum__list dt { font-weight: 700; color: var(--text-strong); }
      .impressum__list dd { margin: 0; color: var(--text-primary); overflow-wrap: anywhere; }
      .impressum__missing { color: var(--text-secondary) !important; font-style: italic; }
      .impressum__links { margin-block-start: 2.5rem; }
      @media (max-width: 30rem) { .impressum__list { grid-template-columns: 1fr; } .impressum__list dd { margin-block-end: .5rem; } }
    `
  ]
})
export class ImpressumPage {
  protected readonly identity = CONTROLLER_IDENTITY;
  protected readonly missing: OperatorField[] = missingOperatorFields();
  protected readonly fieldLabel: Record<OperatorField, string> = {
    operatorLegalName: 'IMPRINT.OPERATOR',
    legalForm: 'IMPRINT.LEGAL_FORM',
    authorisedRepresentative: 'IMPRINT.REPRESENTATIVE',
    streetAddress: 'IMPRINT.STREET',
    postalCode: 'IMPRINT.POSTAL_CODE'
  };

  private readonly lang = toSignal(inject(LanguageService).currentLang$, { initialValue: 'ar' as const });

  protected readonly providerRows = computed<Row[]>(() => {
    const id = this.identity;
    return [
      { labelKey: 'IMPRINT.TRADING_NAME', value: id.displayName, mandatory: true },
      { labelKey: 'IMPRINT.OPERATOR', value: id.operatorLegalName, mandatory: true },
      { labelKey: 'IMPRINT.LEGAL_FORM', value: id.legalForm, mandatory: true },
      { labelKey: 'IMPRINT.REPRESENTATIVE', value: id.authorisedRepresentative, mandatory: true },
      { labelKey: 'IMPRINT.STREET', value: id.streetAddress, mandatory: true },
      { labelKey: 'IMPRINT.POSTAL_CODE', value: id.postalCode, mandatory: true },
      { labelKey: 'IMPRINT.CORRESPONDENCE', value: id.correspondenceAddress[this.lang()], mandatory: true },
      { labelKey: 'IMPRINT.EU_REP', value: id.euRepresentative, mandatory: false, appointment: true },
      { labelKey: 'IMPRINT.DPO', value: id.dataProtectionOfficer, mandatory: false, appointment: true }
    ];
  });

  protected readonly registerRows: Row[] = [
    { labelKey: 'IMPRINT.REGISTER_COURT', value: CONTROLLER_IDENTITY.registerCourt, mandatory: false },
    { labelKey: 'IMPRINT.REGISTER_NUMBER', value: CONTROLLER_IDENTITY.registerNumber, mandatory: false },
    { labelKey: 'IMPRINT.VAT', value: CONTROLLER_IDENTITY.vatId, mandatory: false }
  ];

  constructor() {
    inject(PageMetaService).applyTranslated('SITE.SEO.IMPRESSUM', '/impressum', inject(DestroyRef));
  }
}
