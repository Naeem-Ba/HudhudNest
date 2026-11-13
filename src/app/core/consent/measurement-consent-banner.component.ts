import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { GeoCountryService } from '../services/geo-country.service';
import { MeasurementConsentService } from './measurement-consent.service';

/**
 * Asks, once and only where the law requires it (EU/EEA, UK, CH, TR or unknown country), whether the first-party
 * measurement values may be kept on this device. "Decline" is as prominent as "Allow" and declining blocks nothing:
 * the values then live in memory for this page only. The choice can be changed in Settings.
 */
@Component({
  selector: 'app-measurement-consent-banner',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (consent.showPrompt()) {
      <section class="m-consent" role="region" [attr.aria-label]="'MEASUREMENT.TITLE' | translate" data-testid="measurement-consent">
        <h2 class="m-consent__title">{{ 'MEASUREMENT.TITLE' | translate }}</h2>
        <p class="m-consent__text">
          {{ 'MEASUREMENT.BANNER_TEXT' | translate }}
          <a routerLink="/privacy-policy">{{ 'MEASUREMENT.LEARN_MORE' | translate }}</a>
        </p>
        <div class="m-consent__actions">
          <button type="button" class="m-consent__btn" (click)="consent.deny()">{{ 'MEASUREMENT.DECLINE' | translate }}</button>
          <button type="button" class="m-consent__btn" (click)="consent.grant()">{{ 'MEASUREMENT.ACCEPT' | translate }}</button>
        </div>
      </section>
    }
  `,
  styles: [
    `
      .m-consent { position: fixed; inset-inline: 1rem; inset-block-end: 1rem; z-index: 999; max-width: 34rem; margin-inline: auto; padding: 1rem 1.1rem; border-radius: 14px; background: var(--card-bg, #fff); color: var(--gray-900, #111827); border: 1px solid var(--gray-300, #d1d5db); box-shadow: var(--shadow-lg); }
      .m-consent__title { margin: 0 0 .35rem; font-size: 1rem; }
      .m-consent__text { margin: 0 0 .75rem; font-size: .88rem; line-height: 1.5; }
      .m-consent__text a { color: inherit; text-decoration: underline; }
      .m-consent__actions { display: flex; gap: .6rem; justify-content: flex-end; flex-wrap: wrap; }
      .m-consent__btn { min-height: 44px; padding: .5rem 1.1rem; border-radius: 10px; border: 1px solid var(--gray-400, #9ca3af); background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    `
  ]
})
export class MeasurementConsentBannerComponent implements OnInit {
  protected readonly consent = inject(MeasurementConsentService);
  private readonly geo = inject(GeoCountryService);

  ngOnInit(): void {
    // The country matters only while nothing was chosen; a stored choice decides on its own.
    if (this.consent.choice() !== 'unset') return;
    void this.geo.fetchCountryCode().then(code => this.consent.setCountry(code));
  }
}
