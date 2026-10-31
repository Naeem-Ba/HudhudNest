// =============================================================
// src/app/shared/ui/listing-view-count.component.ts
//
// "👁 1,248" — how many times a listing's page was opened. Purely informational: it is a <span>,
// not a button, takes no click and has no hover state of its own, so it cannot be mistaken for the
// favorite/share/report actions it sits next to.
//
// It draws whatever count it is given and never counts anything itself: the number comes from the
// server (PropertyDto.viewCount / ShortStayListing.viewCount), and the detail page raises it from
// the answer to POST .../views. No count (an older API) → nothing is drawn, rather than a false 0.
// =============================================================

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { uiNumberLocale } from '../../core/i18n/ui-language';
import { formatViewCountCompact, formatViewCountFull, normalizeViewCount } from '../utils/view-count';

@Component({
  selector: 'app-listing-view-count',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  template: `
    @if (count() !== null) {
      <span
        class="view-count"
        [class.view-count--compact]="compact()"
        [attr.title]="'VIEW_COUNT.LABEL' | translate"
        data-testid="view-count"
      >
        <svg class="view-count__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M1.5 12S5.5 4.5 12 4.5 22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
        </svg>
        <span class="view-count__num" aria-hidden="true">{{ text() }}</span>
        <span class="view-count__sr">{{ 'VIEW_COUNT.ARIA' | translate: { count: full() } }}</span>
      </span>
    }
  `,
  styles: [`
    :host { display: inline-flex; }
    .view-count {
      display: inline-flex; align-items: center; gap: .3rem; white-space: nowrap;
      min-height: 2rem; padding: 0 .65rem; box-sizing: border-box;
      border-radius: var(--r-pill, 9999px);
      background: var(--gray-100, #f1f5f9); color: var(--gray-600, #475569);
      font-size: .8125rem; font-weight: 600; line-height: 1;
      font-variant-numeric: tabular-nums;
      cursor: default; user-select: none;
    }
    .view-count--compact { min-height: 0; padding: 0; background: transparent; font-size: .75rem; font-weight: 500; }
    .view-count__icon { flex: none; width: 1em; height: 1em; font-size: 1.15em; }
    .view-count__sr {
      position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
      overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
    }
    .view-count { position: relative; }
  `]
})
export class ListingViewCountComponent {
  /** The listing's view count; undefined/null when the server did not send one. */
  readonly count = input<number | null, unknown>(null, { transform: normalizeViewCount });
  /** Card form: no pill, short numbers ("1.2K"). The detail page leaves this off and shows the full number. */
  readonly compact = input(false);

  protected readonly full = computed(() => {
    const value = this.count();
    return value === null ? '' : formatViewCountFull(value, uiNumberLocale());
  });

  protected readonly text = computed(() => {
    const value = this.count();
    if (value === null) {
      return '';
    }

    return this.compact()
      ? formatViewCountCompact(value, uiNumberLocale())
      : formatViewCountFull(value, uiNumberLocale());
  });
}
