// Shared, language-aware page for the Privacy Policy and Terms of Use. The legal text lives in
// public/i18n/legal/{ar,en,de,tr}/{privacy,terms}.json (one canonical, reviewable file per
// language — kept out of the UI i18n bundles on purpose so a legal edit never touches UI
// strings and the files can be handed to a lawyer as-is). Routes stay /privacy-policy and
// /terms-of-service; the language is the app's current language (LanguageService).

import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, map, of, switchMap, tap } from 'rxjs';

import { PRIVACY_POLICY_META, TERMS_OF_SERVICE_META } from '../../core/models/consent-versions';
import { LanguageService, LangCode } from '../../core/services/language.service';
import { MetaService } from '../../core/services/meta.service';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { LegalDocKind, LegalDocumentContent, interpolateDocument, parseLegalText } from './legal-document.model';
import { numberLocaleFor } from '../../core/i18n/supported-preferences';

@Component({
  selector: 'app-legal-document',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule, TranslateModule],
  template: `
    <section class="legal">
      <article class="legal__card" [attr.lang]="contentLang()" [attr.dir]="contentDir()">
        @if (content(); as doc) {
          <h1>{{ doc.title }}</h1>
          <dl class="legal__meta" data-legal-meta>
            <div><dt>{{ 'LEGAL.VERSION' | translate }}</dt><dd>{{ meta.version }}</dd></div>
            <div><dt>{{ 'LEGAL.PUBLISHED' | translate }}</dt><dd>{{ publishedLabel() }}</dd></div>
            <div><dt>{{ 'LEGAL.EFFECTIVE' | translate }}</dt><dd>{{ effectiveLabel() }}</dd></div>
            <div><dt>{{ 'LEGAL.UPDATED' | translate }}</dt><dd>{{ updatedLabel() }}</dd></div>
            <div><dt>{{ 'LEGAL.LANGUAGE' | translate }}</dt><dd>{{ languageLabel() }}</dd></div>
          </dl>

          @if (doc.reviewNotice) {
            <p class="legal__review" role="note">{{ doc.reviewNotice }}</p>
          }

          @for (section of doc.sections; track $index) {
            <h2>{{ $index + 1 }}. {{ section.heading }}</h2>
            @for (block of section.blocks; track $index) {
              @if (block.p) {
                <p>
                  @for (seg of segments(block.p); track $index) {
                    @switch (seg.kind) {
                      @case ('route') { <a [routerLink]="seg.href">{{ seg.text }}</a> }
                      @case ('mail') { <a [href]="seg.href">{{ seg.text }}</a> }
                      @default { {{ seg.text }} }
                    }
                  }
                </p>
              }
              @if (block.ul) {
                <ul>
                  @for (item of block.ul; track $index) {
                    <li>
                      @for (seg of segments(item); track $index) {
                        @switch (seg.kind) {
                          @case ('route') { <a [routerLink]="seg.href">{{ seg.text }}</a> }
                          @case ('mail') { <a [href]="seg.href">{{ seg.text }}</a> }
                          @default { {{ seg.text }} }
                        }
                      }
                    </li>
                  }
                </ul>
              }
            }
          }
        } @else if (failed()) {
          <p role="alert">{{ 'LEGAL.LOAD_FAILED' | translate }}</p>
        } @else {
          <p class="legal__loading" aria-busy="true">{{ 'LEGAL.LOADING' | translate }}</p>
        }

        <nav class="legal__related" [attr.aria-label]="'LEGAL.RELATED' | translate">
          <h2>{{ 'LEGAL.RELATED' | translate }}</h2>
          <ul>
            @if (kind !== 'privacy') { <li><a routerLink="/privacy-policy">{{ 'LEGAL_LINKS.PRIVACY' | translate }}</a></li> }
            @if (kind !== 'terms') { <li><a routerLink="/terms-of-service">{{ 'LEGAL_LINKS.TERMS' | translate }}</a></li> }
            <li><a routerLink="/impressum">{{ 'LEGAL_LINKS.IMPRINT' | translate }}</a></li>
            <li><a routerLink="/account-deletion">{{ 'LEGAL_LINKS.DELETION' | translate }}</a></li>
          </ul>
        </nav>

        <a class="legal__back" routerLink="/home">{{ 'LEGAL.BACK_HOME' | translate }}</a>
      </article>
    </section>
  `,
  styles: [`
    .legal {
      min-height: 60vh;
      display: flex;
      justify-content: center;
      padding: clamp(1rem, 3vw, 2.5rem);
    }

    .legal__card {
      width: min(760px, 100%);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-sm);
      padding: var(--space-8) var(--space-6);
      line-height: 1.9;
      overflow-wrap: anywhere;
    }

    .legal__card h1 {
      font-family: var(--font-display);
      font-size: clamp(1.3rem, 3vw, 1.75rem);
      font-weight: 800;
      color: var(--gray-900);
      margin: 0 0 var(--space-2);
    }

    .legal__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-4);
      color: var(--gray-500);
      font-size: var(--text-sm);
      margin: 0 0 var(--space-6);
    }

    .legal__meta div { display: flex; gap: 0.35rem; }
    .legal__meta dt { font-weight: 600; }
    .legal__meta dt::after { content: ':'; }
    .legal__meta dd { margin: 0; }

    .legal__related {
      margin-top: var(--space-8);
      border-top: 1px solid var(--border);
      padding-top: var(--space-4);
    }

    .legal__related ul {
      list-style: none !important;
      padding: 0 !important;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-4);
    }

    .legal__related a { display: inline-block; min-height: 44px; line-height: 44px; }

    .legal__review {
      background: var(--warning-bg, #fff7e0);
      border: 1px solid var(--warning-border, #e8c872);
      border-radius: var(--r-md, 8px);
      color: var(--gray-700, #374151) !important;
      margin: 0 0 var(--space-6);
      padding: var(--space-3) var(--space-4);
    }

    .legal__card h2 {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--gray-900);
      margin: var(--space-6) 0 var(--space-2);
    }

    .legal__card p,
    .legal__card li {
      color: var(--gray-600);
      font-size: var(--text-sm);
    }

    .legal__card ul {
      list-style: disc;
      padding-inline-start: var(--space-6);
      margin: 0 0 var(--space-2);
    }

    .legal__card a {
      color: var(--primary-text);
      text-decoration: underline;
    }

    .legal__card a:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
      border-radius: 2px;
    }

    .legal__back {
      display: inline-block;
      margin-top: var(--space-8);
      font-weight: 600;
      text-decoration: none !important;
    }
  `]
})
export class LegalDocumentPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly metaService = inject(MetaService);
  private readonly shareUrl = inject(PropertyShareUrlService);
  private readonly languages = inject(LanguageService);
  private readonly translate = inject(TranslateService);

  readonly kind: LegalDocKind = this.route.snapshot.data['doc'] === 'terms' ? 'terms' : 'privacy';

  readonly meta = this.kind === 'terms' ? TERMS_OF_SERVICE_META : PRIVACY_POLICY_META;
  readonly lang = toSignal(this.languages.currentLang$, { initialValue: this.languages.getCurrent() });

  readonly content = signal<LegalDocumentContent | null>(null);
  readonly failed = signal(false);
  /** Language of the text actually shown (differs from lang() only if a file failed to load). */
  readonly contentLang = signal<LangCode>(this.languages.getCurrent());
  /** Follows the text shown, not the UI: the Arabic fallback must stay RTL under an LTR UI. */
  readonly contentDir = computed(() => (this.contentLang() === 'ar' ? 'rtl' : 'ltr'));
  readonly segments = parseLegalText;

  // Intl, not DatePipe: the app registers no Angular locale data for ar/de.
  readonly effectiveLabel = computed(() => this.formatDateOrPending(this.meta.effectiveDate));
  readonly publishedLabel = computed(() => this.formatDateOrPending(this.meta.publishedDate));
  readonly updatedLabel = computed(() => this.formatDate(this.meta.lastUpdated));
  readonly languageLabel = computed(
    () => this.languages.getLanguages().find(option => option.code === this.contentLang())?.label ?? this.contentLang()
  );

  constructor() {
    // /datenschutz redirects here with ?lang=de: show that language for this visit without overriding a saved choice.
    const requested = this.route.snapshot.queryParamMap.get('lang');
    if (requested && requested !== this.languages.getCurrent() && ['ar', 'en', 'de', 'tr'].includes(requested)) {
      this.languages.use(requested as LangCode, 'ephemeral');
    }

    // Own clean canonical (this page lives at one URL whatever the language); removed again on leave.
    this.destroyRef.onDestroy(() => this.metaService.clearCanonical());
    toObservable(this.lang)
      .pipe(
        tap(() => {
          this.content.set(null);
          this.failed.set(false);
        }),
        switchMap(lang =>
          this.load(lang).pipe(
            // Never show a blank legal page: fall back to the app's default language file.
            catchError(() => (lang === 'ar' ? of(null) : this.load('ar').pipe(catchError(() => of(null)))))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => {
        if (!result) {
          this.failed.set(true);
          return;
        }
        this.content.set(interpolateDocument(result.doc, result.lang));
        this.contentLang.set(result.lang);
        this.metaService.setMeta({
          title: result.doc.title,
          description: result.doc.metaDescription,
          siteName: result.lang === 'ar' ? 'هدهد نيست' : 'HudhudNest',
          canonical: `${this.shareUrl.getSiteOrigin()}${this.kind === 'terms' ? '/terms-of-service' : '/privacy-policy'}`
        });
      });
  }

  private formatDateOrPending(iso: string | null): string {
    return iso ? this.formatDate(iso) : this.translate.instant('LEGAL.PENDING_PUBLICATION');
  }

  private formatDate(iso: string): string {
    return new Intl.DateTimeFormat(numberLocaleFor(this.lang()), { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso));
  }

  private load(lang: LangCode) {
    return this.http
      .get<LegalDocumentContent>(`/i18n/legal/${lang}/${this.kind}.json`)
      .pipe(map(doc => ({ lang, doc })));
  }
}
