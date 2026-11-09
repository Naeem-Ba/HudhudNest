import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../core/services/page-meta.service';
import { LegalEntity, imprintEntity } from './legal-entity';

/**
 * Impressum / Legal notice. Shows the operator's details from legal-entity.ts; while those are not filled in it says so
 * plainly (and is hidden from every menu) instead of publishing placeholders.
 */
@Component({
  selector: 'app-imprint-page',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="imprint" id="main">
      <h1>{{ 'IMPRINT.TITLE' | translate }}</h1>
      @if (entity; as e) {
        <section aria-labelledby="imprint-provider">
          <h2 id="imprint-provider">{{ 'IMPRINT.PROVIDER' | translate }}</h2>
          <address>
            {{ e.name }}<br />
            {{ e.street }}<br />
            {{ e.postalCode }} {{ e.city }}<br />
            {{ e.country }}
          </address>
        </section>
        <section aria-labelledby="imprint-contact">
          <h2 id="imprint-contact">{{ 'IMPRINT.CONTACT' | translate }}</h2>
          <p>
            {{ 'IMPRINT.EMAIL' | translate }}: <a [href]="'mailto:' + e.email">{{ e.email }}</a>
            @if (e.phone) {
              <br />{{ 'IMPRINT.PHONE' | translate }}: <a [href]="'tel:' + e.phone">{{ e.phone }}</a>
            }
          </p>
        </section>
        @if (e.registerCourt || e.registerNumber) {
          <section aria-labelledby="imprint-register">
            <h2 id="imprint-register">{{ 'IMPRINT.REGISTER' | translate }}</h2>
            <p>{{ e.registerCourt }} {{ e.registerNumber }}</p>
          </section>
        }
        @if (e.vatId) {
          <section aria-labelledby="imprint-vat">
            <h2 id="imprint-vat">{{ 'IMPRINT.VAT' | translate }}</h2>
            <p>{{ e.vatId }}</p>
          </section>
        }
        @if (e.responsiblePerson) {
          <section aria-labelledby="imprint-responsible">
            <h2 id="imprint-responsible">{{ 'IMPRINT.RESPONSIBLE' | translate }}</h2>
            <p>{{ e.responsiblePerson }}</p>
          </section>
        }
      } @else {
        <p class="imprint__pending">{{ 'IMPRINT.NOT_AVAILABLE' | translate }}</p>
      }
      <p class="imprint__links">
        <a routerLink="/privacy-policy">{{ 'LEGAL_LINKS.PRIVACY' | translate }}</a> ·
        <a routerLink="/terms-of-service">{{ 'LEGAL_LINKS.TERMS' | translate }}</a>
      </p>
    </main>
  `,
  styles: [
    `
      .imprint { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; line-height: 1.7; }
      .imprint h1 { font-size: 1.5rem; margin-bottom: 1rem; }
      .imprint h2 { font-size: 1.05rem; margin: 1.25rem 0 0.25rem; }
      .imprint address { font-style: normal; }
      .imprint__pending { color: var(--gray-600, #4b5563); }
      .imprint__links { margin-top: 2rem; }
    `
  ]
})
export class ImprintPage {
  readonly entity: LegalEntity | null = imprintEntity();

  constructor() {
    inject(PageMetaService).applyTranslated('SEO.IMPRINT', '/imprint', inject(DestroyRef));
  }
}
