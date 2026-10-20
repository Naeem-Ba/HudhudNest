// 403 page.
//
// AdminGuard has always redirected here (core/guards/admin-guard.ts:26 returns
// router.createUrlTree(['/not-authorized'])) but the route was never registered, so the
// wildcard `{ path: '**', redirectTo: 'home' }` swallowed it and a non-admin was bounced
// to the home page with no explanation. Registering this page closes that gap.
//
// Inline template, matching the offline page's shape — but with i18n keys and design
// tokens instead of hardcoded Arabic and hex colors.

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-not-authorized',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule],
  template: `
    <section class="not-authorized">
      <div class="not-authorized__card" role="alert">
        <div class="not-authorized__icon" aria-hidden="true">🔒</div>
        <h1>{{ 'NOT_AUTHORIZED.TITLE' | translate }}</h1>
        <p>{{ 'NOT_AUTHORIZED.MESSAGE' | translate }}</p>

        <div class="not-authorized__actions">
          <a class="btn btn--primary" routerLink="/home">
            {{ 'NOT_AUTHORIZED.BACK_HOME' | translate }}
          </a>
          <a class="btn btn--outline" routerLink="/auth/login">
            {{ 'NOT_AUTHORIZED.SWITCH_ACCOUNT' | translate }}
          </a>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .not-authorized {
      min-height: 60vh;
      display: grid;
      place-items: center;
      padding: clamp(1rem, 3vw, 2rem);
    }

    .not-authorized__card {
      width: min(520px, 100%);
      text-align: center;
      padding: var(--space-10) var(--space-6);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      box-shadow: var(--shadow-sm);
    }

    .not-authorized__icon {
      font-size: 2.5rem;
      line-height: 1;
      margin-bottom: var(--space-4);
    }

    .not-authorized__card h1 {
      margin: 0 0 var(--space-3);
      font-family: var(--font-display);
      font-size: clamp(1.3rem, 3vw, 1.75rem);
      font-weight: 800;
      color: var(--gray-900);
    }

    .not-authorized__card p {
      margin: 0 0 var(--space-8);
      font-size: var(--text-sm);
      line-height: 1.8;
      color: var(--gray-500);
    }

    .not-authorized__actions {
      display: flex;
      justify-content: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }
  `]
})
export class NotAuthorizedPage {}
