import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../../core/services/page-meta.service';

/** /ueber-uns: the vision (moved off the home page) and why the project exists. */
@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page.scss',
  template: `
    <div class="wrap page">
      <h1>{{ 'SITE.ABOUT.TITLE' | translate }}</h1>
      <p class="lead">{{ 'SITE.ABOUT.LEAD' | translate }}</p>

      <section aria-labelledby="about-vision">
        <h2 id="about-vision">{{ 'SITE.ABOUT.VISION_TITLE' | translate }}</h2>
        <p>{{ 'SITE.ABOUT.VISION_TEXT' | translate }}</p>
        <ol class="timeline">
          <li>
            <span class="tag">{{ 'SITE.ABOUT.STEP1_TAG' | translate }}</span>
            <h3>{{ 'SITE.ABOUT.STEP1_TITLE' | translate }}</h3>
            <p>{{ 'SITE.ABOUT.STEP1_TEXT' | translate }}</p>
          </li>
          <li>
            <span class="tag">{{ 'SITE.ABOUT.STEP2_TAG' | translate }}</span>
            <h3>{{ 'SITE.ABOUT.STEP2_TITLE' | translate }}</h3>
            <p>{{ 'SITE.ABOUT.STEP2_TEXT' | translate }}</p>
          </li>
        </ol>
      </section>

      <section aria-labelledby="about-why">
        <h2 id="about-why">{{ 'SITE.ABOUT.WHY_TITLE' | translate }}</h2>
        <p>{{ 'SITE.ABOUT.WHY_TEXT' | translate }}</p>
      </section>
    </div>
  `
})
export class AboutPage {
  constructor() {
    inject(PageMetaService).applyTranslated('SITE.SEO.ABOUT', '/ueber-uns', inject(DestroyRef));
  }
}
