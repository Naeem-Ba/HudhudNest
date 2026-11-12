import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../../core/services/page-meta.service';

/**
 * DRAFT TEMPLATE. Every `[TODO: ...]` is a fact only the operator can supply; none is invented here. `npm run check:legal`
 * fails while any remain, and it must pass before a production deploy. The text is German on purpose (German-law
 * notice, § 5 DDG) and is shown as such in every UI language. Note: the app also has /imprint, which stays empty until
 * features/legal/legal-entity.ts is filled in; keep one of the two, not both, once this is final.
 */
@Component({
  selector: 'app-impressum-page',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page.scss',
  template: `
    <div class="wrap page legal">
      <p class="draft" role="note">{{ 'SITE.LEGAL.DRAFT' | translate }}</p>
      <div lang="de" dir="ltr">
        <h1>Impressum</h1>
        <p>Angaben gemäß § 5 DDG</p>

        <h2>Anbieter</h2>
        <address>
          [TODO: Name bzw. Firma inkl. Rechtsform]<br />
          [TODO: Straße und Hausnummer]<br />
          [TODO: PLZ und Ort]<br />
          [TODO: Land]
        </address>

        <h2>Vertretungsberechtigte</h2>
        <p>[TODO: Vertretungsberechtigte Person(en), nur bei juristischen Personen]</p>

        <h2>Kontakt</h2>
        <dl>
          <dt>E-Mail</dt><dd>[TODO: E-Mail-Adresse, die gelesen wird]</dd>
          <dt>Telefon</dt><dd>[TODO: Telefonnummer, optional]</dd>
        </dl>

        <h2>Registereintrag</h2>
        <dl>
          <dt>Registergericht</dt><dd>[TODO: Registergericht, falls eingetragen]</dd>
          <dt>Registernummer</dt><dd>[TODO: Registernummer, falls eingetragen]</dd>
        </dl>

        <h2>Umsatzsteuer-ID</h2>
        <p>Umsatzsteuer-Identifikationsnummer nach § 27a UStG: [TODO: USt-IdNr., falls vorhanden]</p>

        <h2>Verantwortlich für den Inhalt</h2>
        <p>[TODO: Name und Anschrift, falls abweichend vom Anbieter (§ 18 Abs. 2 MStV)]</p>
      </div>
    </div>
  `
})
export class ImpressumPage {
  constructor() {
    inject(PageMetaService).applyTranslated('SITE.SEO.IMPRESSUM', '/impressum', inject(DestroyRef));
  }
}
