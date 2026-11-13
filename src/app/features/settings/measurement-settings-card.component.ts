import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { MeasurementConsentService } from '../../core/consent/measurement-consent.service';

/** Lets anyone change the first-party measurement choice at any time; withdrawing deletes the stored values. */
@Component({
  selector: 'app-measurement-settings-card',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ms" aria-labelledby="ms-title" data-testid="measurement-card">
      <h3 id="ms-title">{{ 'MEASUREMENT.SETTINGS_TITLE' | translate }}</h3>
      <p class="ms__hint">{{ 'MEASUREMENT.SETTINGS_DESC' | translate }}</p>
      <label class="ms__toggle">
        <input type="checkbox" data-testid="measurement-toggle" [checked]="consent.choice() === 'granted'" (change)="toggle($any($event.target).checked)" />
        <span>{{ 'MEASUREMENT.SETTINGS_TOGGLE' | translate }}</span>
      </label>
    </section>
  `,
  styles: [
    `
      .ms { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--gray-200, #e5e7eb); border-radius: 12px; }
      .ms h3 { font-size: 1rem; margin: 0 0 0.25rem; }
      .ms__hint { font-size: 0.85rem; color: var(--gray-600, #4b5563); margin: 0 0 0.5rem; }
      .ms__toggle { display: flex; gap: 0.5rem; align-items: center; min-height: 44px; cursor: pointer; }
    `
  ]
})
export class MeasurementSettingsCardComponent {
  protected readonly consent = inject(MeasurementConsentService);

  protected toggle(on: boolean): void {
    if (on) this.consent.grant();
    else this.consent.deny();
  }
}
