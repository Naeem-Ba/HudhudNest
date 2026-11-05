import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { PriceChange, PriceHistoryApiService } from '../../core/api/price-history-api.service';
import { uiNumberLocale } from '../../core/i18n/ui-language';
import { formatListingPrice } from '../../shared/utils/listing-price';

const FIELD_KEYS: Record<string, string> = {
  PurchasePrice: 'PROPERTY.PURCHASE_PRICE',
  ColdRent: 'PROPERTY.COLD_RENT',
  WarmRent: 'PROPERTY.WARM_RENT'
};

/**
 * Price timeline on the detail page (growth engine P1). Shows nothing until there is at least one
 * real change. The percent is shown only when the server computed it (same currency on both sides);
 * a currency switch is shown as "old → new" without a made-up percent.
 */
@Component({
  selector: 'app-price-history',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (changes().length) {
      <section class="detail-card price-history" data-testid="price-history" aria-labelledby="price-history-title">
        <h2 class="detail-card__title" id="price-history-title">{{ 'PROPERTY_DETAIL.PRICE_HISTORY.TITLE' | translate }}</h2>
        <ol class="price-history__list">
          @for (c of changes(); track $index) {
            <li class="price-history__item" data-testid="price-history-item">
              <time class="price-history__date" [attr.datetime]="c.changedAt">{{ date(c.changedAt) }}</time>
              <span class="price-history__field">{{ fieldKey(c.priceField) | translate }}</span>
              <span class="price-history__values" dir="ltr">
                <span class="price-history__old">{{ money(c.oldValue, c.oldCurrencyCode || c.currencyCode) }}</span>
                <span aria-hidden="true"> → </span>
                <span class="sr-only">{{ 'PROPERTY_DETAIL.PRICE_HISTORY.TO' | translate }}</span>
                <strong>{{ money(c.newValue, c.currencyCode) }}</strong>
              </span>
              @if (c.changePercent !== null && c.changePercent !== 0) {
                <span class="price-history__badge"
                      [class.price-history__badge--down]="c.changePercent < 0"
                      [class.price-history__badge--up]="c.changePercent > 0"
                      dir="ltr">
                  {{ c.changePercent > 0 ? '+' : '' }}{{ c.changePercent }}%
                </span>
              }
            </li>
          }
        </ol>
        <p class="price-history__note">{{ 'PROPERTY_DETAIL.PRICE_HISTORY.NOTE' | translate }}</p>
      </section>
    }
  `,
  styles: [`
    .price-history__list { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
    .price-history__item {
      display: flex; flex-wrap: wrap; align-items: baseline; gap: .25rem .75rem;
      padding-block: .5rem; border-block-end: 1px solid var(--border, #e5e7eb);
    }
    .price-history__item:last-child { border-block-end: 0; }
    .price-history__date { color: var(--text-muted, #5b6470); font-size: .875rem; min-inline-size: 7rem; }
    .price-history__field { font-size: .875rem; }
    .price-history__old { text-decoration: line-through; color: var(--text-muted, #5b6470); }
    .price-history__badge { font-size: .8rem; font-weight: 600; padding: .1rem .45rem; border-radius: 999px; }
    .price-history__badge--down { background: var(--success-bg, #e7f6ec); color: var(--success-text); }
    .price-history__badge--up { background: var(--warning-bg, #fff4e5); color: var(--warning-text, #8a4b00); }
    .price-history__note { margin: .5rem 0 0; font-size: .8rem; color: var(--text-muted, #5b6470); }
    .sr-only { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  `]
})
export class PriceHistoryComponent {
  readonly propertyId = input<string | null | undefined>(null);
  readonly changes = signal<PriceChange[]>([]);

  private readonly api = inject(PriceHistoryApiService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      const id = this.propertyId();
      this.changes.set([]);
      if (!id) return;
      this.api.getChanges(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(changes => this.changes.set(changes));
    });
  }

  fieldKey(field: string): string {
    return FIELD_KEYS[field] ?? 'PROPERTY_DETAIL.PRICE';
  }

  money(value: number | null, currency: string): string {
    return formatListingPrice(value, currency);
  }

  date(iso: string): string {
    const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
    if (Number.isNaN(parsed.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(uiNumberLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
    } catch {
      return parsed.toISOString().slice(0, 10);
    }
  }
}
