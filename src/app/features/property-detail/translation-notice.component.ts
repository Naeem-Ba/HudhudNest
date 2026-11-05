import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationView } from './listing-translation.controller';

/** The one-line status/toggle bar above the description. Shows nothing when there is nothing to say. */
@Component({
  selector: 'app-translation-notice',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view() !== 'none') {
      <div class="translation-notice" role="status" data-testid="translation-notice">
        @switch (view()) {
          @case ('loading') {
            <span class="translation-notice__text">{{ 'PROPERTY_DETAIL.TRANSLATION.LOADING' | translate }}</span>
          }
          @case ('waiting') {
            <span class="translation-notice__text">{{ 'PROPERTY_DETAIL.TRANSLATION.WAITING' | translate }}</span>
          }
          @case ('ready') {
            <span class="translation-notice__text">
              {{ (showOriginal() ? 'PROPERTY_DETAIL.TRANSLATION.SHOWING_ORIGINAL' : 'PROPERTY_DETAIL.TRANSLATION.AUTO_LABEL') | translate }}
            </span>
            <button type="button" class="translation-notice__action" (click)="toggle.emit()" data-testid="translation-toggle">
              {{ (showOriginal() ? 'PROPERTY_DETAIL.TRANSLATION.SHOW_TRANSLATION' : 'PROPERTY_DETAIL.TRANSLATION.SHOW_ORIGINAL') | translate }}
            </button>
          }
          @case ('unavailable') {
            <span class="translation-notice__text">{{ 'PROPERTY_DETAIL.TRANSLATION.UNAVAILABLE' | translate }}</span>
            <button type="button" class="translation-notice__action" (click)="retry.emit()" data-testid="translation-retry">
              {{ 'PROPERTY_DETAIL.TRANSLATION.RETRY' | translate }}
            </button>
          }
        }
      </div>
    }
  `,
  styles: [`
    .translation-notice {
      display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem;
      margin-block: 0 .75rem; font-size: .875rem; color: var(--text-muted, #5b6470);
    }
    .translation-notice__action {
      background: none; border: 0; padding: 0; font: inherit; cursor: pointer;
      color: var(--primary-text); text-decoration: underline;
    }
  `]
})
export class TranslationNoticeComponent {
  readonly view = input.required<TranslationView>();
  readonly showOriginal = input(false);
  readonly toggle = output<void>();
  readonly retry = output<void>();
}
