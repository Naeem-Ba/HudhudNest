import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { NewsletterApiService, NewsletterStatus } from '../../core/api/newsletter-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { PreferencesService } from '../../core/services/preferences.service';

/**
 * The newsletter (marketing e-mail) for the signed-in account: its state, a subscribe button that only sends the
 * double opt-in mail, and an unsubscribe button that takes effect at once. Service e-mail is not affected.
 */
@Component({
  selector: 'app-newsletter-settings-card',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (signedIn) {
      <section class="nl" aria-labelledby="nl-title" data-testid="newsletter-card">
        <h3 id="nl-title">{{ 'NEWSLETTER.SETTINGS_TITLE' | translate }}</h3>
        <p class="nl__hint">{{ 'NEWSLETTER.SETTINGS_DESC' | translate }}</p>
        @if (status(); as s) {
          <p class="nl__status" data-testid="newsletter-status">{{ 'NEWSLETTER.STATUS_' + s.toUpperCase() | translate }}</p>
          @if (s === 'Active' || s === 'Pending') {
            <button type="button" class="nl__btn" [disabled]="busy()" (click)="unsubscribe()">{{ 'NEWSLETTER.UNSUBSCRIBE' | translate }}</button>
          } @else {
            <label class="nl__consent">
              <input type="checkbox" [checked]="consent()" (change)="consent.set($any($event.target).checked)" />
              <span>{{ 'NEWSLETTER.OPT_IN_LABEL' | translate }}</span>
            </label>
            <button type="button" class="nl__btn" [disabled]="busy() || !consent()" (click)="subscribe()">{{ 'NEWSLETTER.SUBSCRIBE' | translate }}</button>
          }
        }
        @if (message()) {
          <p class="nl__msg" role="status">{{ message() | translate }}</p>
        }
        <p class="nl__note">{{ 'NEWSLETTER.SERVICE_MAIL_NOTE' | translate }} <a routerLink="/privacy-policy">{{ 'LEGAL_LINKS.PRIVACY' | translate }}</a></p>
      </section>
    }
  `,
  styles: [
    `
      .nl { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--gray-200, #e5e7eb); border-radius: 12px; }
      .nl h3 { font-size: 1rem; margin: 0 0 0.25rem; }
      .nl__hint, .nl__note { font-size: 0.85rem; color: var(--gray-600, #4b5563); margin: 0 0 0.5rem; }
      .nl__status { font-weight: 600; margin: 0.5rem 0; }
      .nl__consent { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.5rem 0; font-size: 0.9rem; }
      .nl__btn { min-height: 44px; padding: 0.5rem 1rem; border-radius: 10px; border: 1px solid var(--gray-400, #9ca3af); background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
      .nl__btn[disabled] { opacity: 0.6; cursor: default; }
      .nl__msg { margin: 0.5rem 0; }
    `
  ]
})
export class NewsletterSettingsCardComponent implements OnInit {
  private readonly api = inject(NewsletterApiService);
  private readonly auth = inject(AuthService);
  protected readonly signedIn = inject(PreferencesService).isSignedIn;

  protected readonly status = signal<NewsletterStatus | null>(null);
  protected readonly consent = signal(false);
  protected readonly busy = signal(false);
  protected readonly message = signal('');

  ngOnInit(): void {
    if (this.signedIn) this.load();
  }

  protected subscribe(): void {
    const email = this.auth.currentUserSnapshot?.email;
    if (!email || !this.consent()) return;
    this.busy.set(true);
    this.api.subscribe(email, true).subscribe({
      next: () => {
        this.busy.set(false);
        this.consent.set(false);
        this.message.set('NEWSLETTER.SUBSCRIBE_SENT');
        this.load();
      },
      error: () => {
        this.busy.set(false);
        this.message.set('NEWSLETTER.ERROR');
      }
    });
  }

  protected unsubscribe(): void {
    this.busy.set(true);
    this.api.unsubscribeMine().subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set('NEWSLETTER.UNSUBSCRIBED_DONE');
        this.status.set('Unsubscribed');
      },
      error: () => {
        this.busy.set(false);
        this.message.set('NEWSLETTER.ERROR');
      }
    });
  }

  private load(): void {
    this.api.getMine().subscribe({
      next: dto => this.status.set(dto.status),
      error: () => this.status.set(null)
    });
  }
}
