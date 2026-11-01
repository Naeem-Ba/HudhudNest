import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { PushRegistrationService } from '../../core/push/push-registration.service';

/**
 * "Turn on notifications" card for the installed app. Shown only where there is something to turn on:
 *  - permission not asked yet ('prompt'): an explanation and one button, which is what shows the system dialog
 *    (asking at sign-in, before the person has seen a single notification, gets the lowest "allow" rate and is
 *    what the store reviewers look at);
 *  - permission refused ('denied'): a one-line hint, because only the phone's settings can change it now.
 * Nothing is rendered on the web or when notifications are already on.
 */
@Component({
  selector: 'app-push-opt-in',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    @if (push.permission() === 'prompt') {
      <section class="opt-in" aria-labelledby="push-opt-in-title">
        <div>
          <h2 id="push-opt-in-title">{{ 'NOTIFICATIONS.PUSH_PROMPT_TITLE' | translate }}</h2>
          <p>{{ 'NOTIFICATIONS.PUSH_PROMPT_BODY' | translate }}</p>
        </div>
        <button type="button" class="opt-in__btn" [disabled]="busy()" (click)="enable()">
          {{ 'NOTIFICATIONS.PUSH_ENABLE' | translate }}
        </button>
      </section>
    } @else if (push.permission() === 'denied') {
      <p class="opt-in opt-in--note" role="note">{{ 'NOTIFICATIONS.PUSH_DENIED' | translate }}</p>
    }
  `,
  styles: [`
    .opt-in {
      display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
      margin: 0 0 1rem; padding: 1rem 1.1rem; border: 1px solid var(--border); border-radius: var(--r-lg, 14px);
      background: var(--primary-soft);
    }
    .opt-in h2 { margin: 0 0 .2rem; font-size: 1rem; color: var(--text-strong); }
    .opt-in p { margin: 0; color: var(--gray-700); font-size: var(--text-sm, .875rem); }
    .opt-in--note { display: block; color: var(--gray-700); }
    .opt-in__btn {
      min-height: 44px; padding: .55rem 1.2rem; border: 0; border-radius: var(--r-md, 10px); cursor: pointer;
      background: var(--primary); color: var(--on-primary); font: inherit; font-weight: 700;
    }
    .opt-in__btn:disabled { opacity: .6; cursor: default; }
  `]
})
export class PushOptInComponent {
  readonly push = inject(PushRegistrationService);
  readonly busy = signal(false);

  async enable(): Promise<void> {
    this.busy.set(true);
    try {
      await this.push.enable();
    } finally {
      this.busy.set(false);
    }
  }
}
