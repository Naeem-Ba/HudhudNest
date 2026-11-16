import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../../core/services/page-meta.service';
import { MARKETING_CONFIG, platformUrl } from '../marketing.config';

/** /fuer-anbieter: why and how to list a property; the call to action leaves for the platform's add-listing flow. */
@Component({
  selector: 'app-providers-page',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page.scss',
  template: `
    <div class="wrap page">
      <h1>{{ 'SITE.PROVIDERS.TITLE' | translate }}</h1>
      <p class="lead">{{ 'SITE.PROVIDERS.LEAD' | translate }}</p>
      <p class="pill">{{ 'SITE.PROVIDERS.FREE' | translate }}</p>

      <section aria-labelledby="prov-steps">
        <h2 id="prov-steps">{{ 'SITE.PROVIDERS.STEPS_TITLE' | translate }}</h2>
        <ol class="steps">
          @for (step of steps; track step.t) {
            <li>
              <h3>{{ step.t | translate }}</h3>
              <p>{{ step.d | translate }}</p>
            </li>
          }
        </ol>
      </section>

      <section aria-labelledby="prov-why">
        <h2 id="prov-why">{{ 'SITE.PROVIDERS.WHY_TITLE' | translate }}</h2>
        <ul class="bullets">
          @for (item of why; track item.t) {
            <li>
              <h3>{{ item.t | translate }}</h3>
              <p>{{ item.d | translate }}</p>
            </li>
          }
        </ul>
      </section>

      <a class="btn" [href]="publishHref">{{ 'SITE.HERO.CTA_PUBLISH' | translate }}</a>
    </div>
  `
})
export class ProvidersPage {
  readonly steps = [1, 2, 3].map(n => ({ t: `SITE.PROVIDERS.STEP${n}_T`, d: `SITE.PROVIDERS.STEP${n}_D` }));
  readonly why = ['FREE', 'REACH', 'SIMPLE'].map(k => ({ t: `SITE.PROVIDERS.WHY_${k}_T`, d: `SITE.PROVIDERS.WHY_${k}_D` }));
  readonly publishHref = platformUrl(inject(MARKETING_CONFIG), '/property-form');

  constructor() {
    inject(PageMetaService).applyTranslated('SITE.SEO.PROVIDERS', '/fuer-anbieter', inject(DestroyRef));
  }
}
