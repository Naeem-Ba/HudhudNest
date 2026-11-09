import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AnonymousSearchRequest } from '../../core/api/search-request-api.service';
import { StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { currentUiLanguage } from '../../core/i18n/ui-language';
import { formatListingPrice } from '../../shared/utils/listing-price';

/** The criteria of one request, as both sides see them. Never shows who asked (there is nothing to show). */
@Component({
  selector: 'app-search-request-summary',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = request();
    <p class="srs__headline">
      <strong>{{ (r.listingType === 'ForSale' ? 'SEARCH_REQUESTS.TYPE_BUY' : 'SEARCH_REQUESTS.TYPE_RENT') | translate }}</strong>
      · {{ governorate() || ('SEARCH_REQUESTS.GOVERNORATE' | translate) }}
    </p>
    <ul class="srs__facts">
      <li>{{ 'SEARCH_REQUESTS.BUDGET' | translate }}: <span dir="ltr">{{ budget() }}</span></li>
      @if (r.minRooms) { <li>{{ 'SEARCH_REQUESTS.MIN_ROOMS' | translate }}: {{ r.minRooms }}</li> }
      @if (r.minArea || r.maxArea) {
        <li>{{ 'SEARCH_REQUESTS.AREA' | translate }}: <span dir="ltr">{{ r.minArea ?? '…' }} – {{ r.maxArea ?? '…' }} m²</span></li>
      }
      @if (r.needsBalcony) { <li>{{ 'PROPERTY.HAS_BALCONY' | translate }}</li> }
      @if (r.needsElevator) { <li>{{ 'PROPERTY.HAS_ELEVATOR' | translate }}</li> }
      @if (r.needsParking) { <li>{{ 'PROPERTY.HAS_PARKING' | translate }}</li> }
      @if (r.needsFurnished) { <li>{{ 'SEARCH_REQUESTS.FURNISHED' | translate }}</li> }
    </ul>
    @if (r.details) { <p class="srs__details">{{ r.details }}</p> }
  `,
  styles: [`
    .srs__headline { margin: 0 0 .25rem; }
    .srs__facts { display: flex; flex-wrap: wrap; gap: .25rem .75rem; list-style: none; margin: 0; padding: 0; font-size: .9rem; }
    .srs__details { margin: .5rem 0 0; white-space: pre-line; overflow-wrap: anywhere; color: var(--text-muted, #5b6470); }
  `]
})
export class SearchRequestSummaryComponent {
  readonly request = input.required<AnonymousSearchRequest>();
  readonly governorates = input<StructuredLocationLookup[]>([]);

  readonly governorate = computed(() => {
    const found = this.governorates().find(g => g.id === this.request().governorateId);
    return found ? pickLocalizedName(found, currentUiLanguage() ?? 'ar') : '';
  });

  readonly budget = computed(() => {
    const r = this.request();
    const max = formatListingPrice(r.maxBudget, r.currencyCode);
    return r.minBudget ? `${formatListingPrice(r.minBudget, r.currencyCode)} – ${max}` : `≤ ${max}`;
  });
}
