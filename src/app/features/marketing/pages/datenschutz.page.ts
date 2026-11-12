import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../../core/services/page-meta.service';

/**
 * DRAFT SKELETON. Only the structure and facts the code itself establishes are stated (hosting on Netlify, waitlist
 * data in Supabase, which columns are stored). Everything that depends on contracts, locations or the operator is a
 * `[TODO: ...]`; no legal claim is invented. `npm run check:legal` fails while any `[TODO` remains. German on
 * purpose, shown as such in every UI language. The app also has /privacy-policy with full text: reconcile the two
 * with a lawyer before launch so the site does not carry two different policies.
 */
@Component({
  selector: 'app-datenschutz-page',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page.scss',
  template: `
    <div class="wrap page legal">
      <p class="draft" role="note">{{ 'SITE.LEGAL.DRAFT' | translate }}</p>
      <div lang="de" dir="ltr">
        <h1>Datenschutzerklärung</h1>

        <h2>1. Verantwortlicher</h2>
        <p>[TODO: Name/Firma, Anschrift und E-Mail des Verantwortlichen nach Art. 4 Nr. 7 DSGVO; muss mit dem <a routerLink="/impressum">Impressum</a> übereinstimmen]</p>

        <h2>2. Hosting (Netlify)</h2>
        <p>Diese Website wird bei Netlify gehostet. Beim Aufruf verarbeitet der Hosting-Anbieter technisch notwendige Verbindungsdaten (z. B. IP-Adresse, Zeitpunkt, aufgerufene Seite).</p>
        <p>[TODO: Anbieter-Angaben (Firma, Sitz), Rechtsgrundlage (Art. 6 Abs. 1 lit. f DSGVO), Auftragsverarbeitungsvertrag, Drittlandübermittlung und Garantien, Speicherdauer der Server-Logs]</p>

        <h2>3. Datenbank (Supabase)</h2>
        <p>Die Daten der Warteliste werden in einer Datenbank von Supabase gespeichert.</p>
        <p>[TODO: Anbieter-Angaben, gewählte Region des Projekts, Auftragsverarbeitungsvertrag, Drittlandübermittlung und Garantien]</p>

        <h2>4. Warteliste: Daten und Rechtsgrundlage Einwilligung</h2>
        <p>Wenn Sie sich auf die Warteliste eintragen, speichern wir: Ihre E-Mail-Adresse oder WhatsApp-Nummer, optional Ihr Interesse (Kaufen, Mieten, Kurzzeitaufenthalt), die gewählte Sprache sowie den Zeitpunkt Ihrer Einwilligung und der Eintragung. Wir speichern keine IP-Adresse und setzen für die Warteliste kein Tracking ein.</p>
        <p>Rechtsgrundlage ist Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Sie können sie jederzeit mit Wirkung für die Zukunft widerrufen; die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt.</p>
        <p>[TODO: Zweck im Wortlaut (z. B. einmalige Benachrichtigung zum Start), Löschfrist, Kanal des Widerrufs, Hinweis zu WhatsApp als Kommunikationskanal und dessen Anbieter, falls dort tatsächlich kontaktiert wird]</p>

        <h2>5. Cookies und Local Storage</h2>
        <p>Die Website speichert im Browser Einstellungen wie die gewählte Sprache und das Farbschema (Local Storage). Für die Warteliste werden keine Cookies gesetzt.</p>
        <p>[TODO: vollständige Liste weiterer Cookies/Speicher (z. B. Anmeldung auf der Plattform, Fehlerberichte, Werbung), jeweils mit Zweck, Dauer und Rechtsgrundlage]</p>

        <h2>6. Ihre Rechte als betroffene Person</h2>
        <p>Sie haben nach der DSGVO das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21) sowie das Recht, eine erteilte Einwilligung zu widerrufen (Art. 7 Abs. 3) und sich bei einer Aufsichtsbehörde zu beschweren (Art. 77).</p>
        <p>[TODO: zuständige Aufsichtsbehörde]</p>

        <h2>7. Kontakt Datenschutz</h2>
        <p>[TODO: E-Mail-Adresse für Datenschutzanfragen; Datenschutzbeauftragter, falls benannt]</p>
      </div>
    </div>
  `
})
export class DatenschutzPage {
  constructor() {
    inject(PageMetaService).applyTranslated('SITE.SEO.PRIVACY', '/datenschutz', inject(DestroyRef));
  }
}
