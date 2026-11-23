import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { AdsConsentService } from './ads-consent.service';

/**
 * Asks, once, whether advertising may run on the website. It exists in the DOM only while ads are switched on for
 * the web build and no choice was made (or the visitor reopened it), so with ads off nothing changes for anyone.
 * "Decline" is as prominent as "Allow", and declining never blocks any feature.
 */
@Component({
  selector: 'app-ads-consent-banner',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (consent.showWebPrompt()) {
      <section class="ads-consent" role="dialog" aria-modal="false" [attr.aria-label]="'ADS.CONSENT_TITLE' | translate">
        <h2 class="ads-consent__title">{{ 'ADS.CONSENT_TITLE' | translate }}</h2>
        <p class="ads-consent__text">{{ 'ADS.CONSENT_TEXT' | translate }}</p>
        <div class="ads-consent__actions">
          <button type="button" class="ads-consent__btn" (click)="consent.deny()">{{ 'ADS.DECLINE' | translate }}</button>
          <button type="button" class="ads-consent__btn" (click)="consent.grant()">{{ 'ADS.ACCEPT' | translate }}</button>
        </div>
      </section>
    }
  `,
  styles: [
    `
      .ads-consent { position: fixed; inset-inline: 1rem; inset-block-end: 1rem; z-index: calc(var(--z-overlay, 300) - 1); max-width: 34rem; margin-inline: auto; padding: 1rem 1.1rem; border-radius: 14px; background: var(--card-bg, #fff); color: var(--gray-900, #111827); border: 1px solid var(--gray-300, #d1d5db); box-shadow: 0 8px 28px rgba(15, 23, 42, .18); }
      .ads-consent__title { margin: 0 0 .35rem; font-size: 1rem; }
      .ads-consent__text { margin: 0 0 .75rem; font-size: .88rem; line-height: 1.5; }
      .ads-consent__actions { display: flex; gap: .6rem; justify-content: flex-end; }
      .ads-consent__btn { min-height: 44px; padding: .5rem 1.1rem; border-radius: 10px; border: 1px solid var(--gray-400, #9ca3af); background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    `
  ]
})
export class AdsConsentBannerComponent {
  protected readonly consent = inject(AdsConsentService);
}
