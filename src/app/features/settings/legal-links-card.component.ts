import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Privacy policy, terms, account deletion and the Impressum (provider information), reachable from
 * inside the app for every user, signed in or not. Apple (5.1.1) and Google Play require the privacy policy to be
 * reachable in the app itself, not only on the sign-up form and the landing footer (QA phase 22, LEG-001).
 */
@Component({
  selector: 'app-legal-links-card',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="legal-links" aria-labelledby="legal-links-title">
      <h3 id="legal-links-title">{{ 'LEGAL_LINKS.TITLE' | translate }}</h3>
      <ul>
        <li><a routerLink="/privacy-policy">{{ 'LEGAL_LINKS.PRIVACY' | translate }}</a></li>
        <li><a routerLink="/terms-of-service">{{ 'LEGAL_LINKS.TERMS' | translate }}</a></li>
        <li><a routerLink="/account-deletion">{{ 'LEGAL_LINKS.DELETION' | translate }}</a></li>
        <li><a routerLink="/impressum">{{ 'LEGAL_LINKS.IMPRINT' | translate }}</a></li>
        <li><a href="mailto:support@hudhudnest.com">{{ 'LEGAL_LINKS.CONTACT' | translate }}</a></li>
      </ul>
    </section>
  `,
  styles: [
    `
      .legal-links { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--gray-200, #e5e7eb); border-radius: 12px; }
      .legal-links h3 { font-size: 1rem; margin: 0 0 0.5rem; }
      .legal-links ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; }
      .legal-links a { display: inline-block; min-height: 44px; line-height: 44px; }
    `
  ]
})
export class LegalLinksCardComponent {}
