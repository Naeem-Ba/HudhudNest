import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../../core/services/page-meta.service';
import { CtaTarget, MARKETING_CONFIG, heroCtas, platformUrl, startCards } from '../marketing.config';
import { WaitlistService } from '../waitlist/waitlist.service';

/** The 24x24 line icons of the "Hier starten" cards. */
const ICONS = {
  home: ['M3 11 12 4l9 7v9H3z', 'M9 20v-6h6v6'],
  key: ['M3 15a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'm11 12 9-9M16 7l3 3'],
  bed: ['M3 18V7M3 14h18v4M21 14v-3a3 3 0 0 0-3-3h-7v6'],
  plus: ['M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z', 'M12 8v8M8 12h8']
} as const;

/**
 * Public home page (/landing): hero, three reasons, four ways to start. Nothing else.
 * Vision, provider pitch and contact live on their own pages. With no listings yet (listingsLive false) there is
 * no search and no link into an empty result list.
 */
@Component({
  selector: 'app-landing-home',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing-home.component.html',
  styleUrl: './landing-home.component.scss'
})
export class LandingHomeComponent {
  private readonly config = inject(MARKETING_CONFIG);
  private readonly waitlist = inject(WaitlistService);

  readonly icons = ICONS;
  readonly hero = heroCtas(this.config.listingsLive);
  readonly cards = startCards(this.config.listingsLive);
  readonly whyKeys = ['ALL', 'CLEAR', 'DIRECT'] as const;

  constructor() {
    inject(PageMetaService).applyTranslated('LANDING.SEO', '/landing', inject(DestroyRef));
  }

  href(target: CtaTarget): string | null {
    return target.kind === 'platform' ? platformUrl(this.config, target.path) : null;
  }

  openWaitlist(target: CtaTarget): void {
    if (target.kind === 'waitlist') {
      this.waitlist.open(target.interest);
    }
  }
}
