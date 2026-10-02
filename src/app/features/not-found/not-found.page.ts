// 404 page.
//
// This is a static-hosted CSR app (Netlify + `public/_redirects` rewriting every path to
// `/index.html 200`) -- there is no server in front of Angular that can return a real HTTP 404
// status code for an arbitrary unmatched URL. Before this page existed, the wildcard route
// (`{ path: '**', redirectTo: 'home' }`) silently showed the homepage for any dead/mistyped
// link: a classic "soft 404" (a non-existent URL returning 200 with content that gives no
// indication anything is wrong), which Google's own guidance calls out as something to avoid.
//
// The fix available in this architecture -- a genuine "not found" page + an explicit
// `noindex, nofollow` on it -- is exactly what Google recommends when a true 404 status isn't
// achievable: "if that's not technically possible, [...] display a clear 'not found' message to
// users and bots alike". `PropertyMetaService.markNotFound()` already does the equivalent for a
// single deleted/unpublished property id (see ARD-HudhudNest.md, ADR-001-R); this page covers
// every other unmatched route via the wildcard, which now redirects here instead of to home.
//
// Registered as a named child route under LayoutComponent (keeps the navbar, matching
// not-authorized.page.ts's pattern) rather than a bare top-level wildcard page.

import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MetaService } from '../../core/services/meta.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule],
  template: `
    <section class="not-found">
      <div class="not-found__card" role="alert">
        <div class="not-found__icon" aria-hidden="true">🔍</div>
        <h1>{{ 'NOT_FOUND.TITLE' | translate }}</h1>
        <p>{{ 'NOT_FOUND.MESSAGE' | translate }}</p>

        <div class="not-found__actions">
          <a class="btn btn--primary" routerLink="/home">
            {{ 'NOT_FOUND.BACK_HOME' | translate }}
          </a>
          <a class="btn btn--outline" routerLink="/properties">
            {{ 'NOT_FOUND.BROWSE_PROPERTIES' | translate }}
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .not-found {
      min-height: 60vh;
      display: grid;
      place-items: center;
      padding: clamp(1rem, 3vw, 2rem);
    }

    .not-found__card {
      width: min(520px, 100%);
      text-align: center;
      padding: var(--space-10) var(--space-6);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-sm);
    }

    .not-found__icon {
      font-size: 2.5rem;
      line-height: 1;
      margin-bottom: var(--space-4);
    }

    .not-found__card h1 {
      margin: 0 0 var(--space-3);
      font-family: var(--font-display);
      font-size: clamp(1.3rem, 3vw, 1.75rem);
      font-weight: 800;
      color: var(--gray-900);
    }

    .not-found__card p {
      margin: 0 0 var(--space-8);
      font-size: var(--text-sm);
      line-height: 1.8;
      color: var(--gray-500);
    }

    .not-found__actions {
      display: flex;
      justify-content: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
  `]
})
export class NotFoundPage {
  private readonly title = inject(Title);
  private readonly meta = inject(MetaService);
  private readonly translate = inject(TranslateService);

  constructor() {
    this.title.setTitle(`${this.translate.instant('NOT_FOUND.TITLE')} | هدهد نيست`);
    this.meta.setPageRobots('noindex, nofollow');

    inject(DestroyRef).onDestroy(() => this.meta.setPageRobots(null));
  }
}
