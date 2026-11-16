import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { ListingTitleTranslationService } from '../../core/api/listing-title-translation.service';
import { TranslationListingKind } from '../../core/api/listing-translation.service';

/**
 * One line above a list: "Automatically translated · Show original". Only appears when at least one title of
 * the list on screen is actually shown translated, so a visitor reading their own language never sees it.
 */
@Component({
  selector: 'app-listing-title-translation-bar',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="title-translation-bar" role="status" data-testid="title-translation-bar">
        <span>
          {{ (titles.showingOriginal() ? 'PROPERTY_DETAIL.TRANSLATION.SHOWING_ORIGINAL' : 'PROPERTY_DETAIL.TRANSLATION.AUTO_LABEL') | translate }}
        </span>
        <button type="button" class="title-translation-bar__action" (click)="titles.toggleOriginal()" data-testid="title-translation-toggle">
          {{ (titles.showingOriginal() ? 'PROPERTY_DETAIL.TRANSLATION.SHOW_TRANSLATION' : 'PROPERTY_DETAIL.TRANSLATION.SHOW_ORIGINAL') | translate }}
        </button>
      </div>
    }
  `,
  styles: [`
    .title-translation-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: .5rem .75rem;
      margin-block: 0 .75rem; font-size: .875rem; color: var(--text-muted, #5b6470);
    }
    .title-translation-bar__action {
      background: none; border: 0; padding: 0; font: inherit; cursor: pointer;
      color: var(--primary-text); text-decoration: underline;
    }
  `]
})
export class ListingTitleTranslationBarComponent {
  protected readonly titles = inject(ListingTitleTranslationService);

  readonly items = input.required<readonly { id: string; title?: string | null }[]>();
  readonly kind = input.required<TranslationListingKind>();

  protected visible(): boolean {
    const kind = this.kind();
    return this.items().some(item => this.titles.hasTranslation(kind, item.id, item.title));
  }
}
