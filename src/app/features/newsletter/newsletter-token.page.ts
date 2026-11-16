import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { NewsletterApiService } from '../../core/api/newsletter-api.service';
import { PageMetaService } from '../../core/services/page-meta.service';

type Mode = 'confirm' | 'unsubscribe';
type State = 'idle' | 'working' | 'done' | 'invalid' | 'error' | 'missing';

/**
 * /newsletter/confirm?token=… and /newsletter/unsubscribe?token=…, opened from the links in the e-mails; no sign-in.
 * Confirming posts at once (the person clicked the link to confirm). Unsubscribing asks for one click on this page, so
 * a mail scanner that only opens links can never unsubscribe anyone; the one-click header for mail clients goes to
 * the API directly.
 */
@Component({
  selector: 'app-newsletter-token-page',
  standalone: true,
  imports: [RouterLink, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="nlp" id="main">
      <h1>{{ (mode === 'confirm' ? 'NEWSLETTER.CONFIRM_TITLE' : 'NEWSLETTER.UNSUB_TITLE') | translate }}</h1>
      @switch (state()) {
        @case ('missing') { <p role="alert">{{ 'NEWSLETTER.MISSING_TOKEN' | translate }}</p> }
        @case ('working') { <p role="status">{{ 'NEWSLETTER.WORKING' | translate }}</p> }
        @case ('invalid') {
          <p role="alert">{{ (mode === 'confirm' ? 'NEWSLETTER.CONFIRM_INVALID' : 'NEWSLETTER.UNSUB_INVALID') | translate }}</p>
        }
        @case ('error') { <p role="alert">{{ 'NEWSLETTER.ERROR' | translate }}</p> }
        @case ('done') {
          <p role="status" data-testid="newsletter-done">{{ (mode === 'confirm' ? 'NEWSLETTER.CONFIRMED' : 'NEWSLETTER.UNSUB_DONE') | translate }}</p>
        }
        @default {
          @if (mode === 'unsubscribe') {
            <p>{{ 'NEWSLETTER.UNSUB_BODY' | translate }}</p>
            <button type="button" class="nlp__btn" data-testid="newsletter-unsubscribe" (click)="run()">{{ 'NEWSLETTER.UNSUB_BUTTON' | translate }}</button>
          }
        }
      }
      <p class="nlp__note">{{ 'NEWSLETTER.SERVICE_MAIL_NOTE' | translate }}</p>
      <p><a routerLink="/privacy-policy">{{ 'LEGAL_LINKS.PRIVACY' | translate }}</a> · <a routerLink="/">{{ 'NEWSLETTER.BACK_HOME' | translate }}</a></p>
    </main>
  `,
  styles: [
    `
      .nlp { max-width: 560px; margin: 0 auto; padding: 2rem 1rem 3rem; line-height: 1.7; }
      .nlp h1 { font-size: 1.4rem; margin-bottom: 1rem; }
      .nlp__btn { min-height: 44px; padding: 0.5rem 1.2rem; border-radius: 10px; border: 1px solid var(--gray-400, #9ca3af); background: transparent; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
      .nlp__note { font-size: 0.85rem; color: var(--gray-600, #4b5563); margin-top: 1.5rem; }
    `
  ]
})
export class NewsletterTokenPage implements OnInit {
  private readonly api = inject(NewsletterApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly mode: Mode = this.route.snapshot.data['mode'] === 'confirm' ? 'confirm' : 'unsubscribe';
  protected readonly state = signal<State>('idle');
  private readonly token = (this.route.snapshot.queryParamMap.get('token') ?? '').trim();

  constructor() {
    inject(PageMetaService).applyTranslated(
      this.mode === 'confirm' ? 'SEO.NEWSLETTER_CONFIRM' : 'SEO.NEWSLETTER_UNSUBSCRIBE',
      this.mode === 'confirm' ? '/newsletter/confirm' : '/newsletter/unsubscribe',
      inject(DestroyRef)
    );
  }

  ngOnInit(): void {
    if (!this.token) {
      this.state.set('missing');
      return;
    }
    if (this.mode === 'confirm') this.run();
  }

  protected run(): void {
    this.state.set('working');
    const call = this.mode === 'confirm' ? this.api.confirm(this.token) : this.api.unsubscribe(this.token);
    call.subscribe({
      next: () => this.state.set('done'),
      error: (err: { status?: number }) => this.state.set(err?.status === 400 ? 'invalid' : 'error')
    });
  }
}
