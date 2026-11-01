import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  AnonymousSearchRequest, ListingDemand, SearchRequestApiService, SearchRequestType
} from '../../core/api/search-request-api.service';
import { LookupsApiService, StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { Property } from '../../core/models/property.model';
import { currentUiLanguage } from '../../core/i18n/ui-language';
import { ToastService } from '../../shared/services/toast.service';
import { SearchRequestSummaryComponent } from './search-request-summary.component';

/**
 * Advertiser side of growth engine P2, two routes on one page:
 * - /search-requests/board: all active requests (anonymous), filterable; propose one of my listings.
 * - /search-requests/for-listing/:propertyId: requests the matcher scores as fitting one listing.
 * The API refuses the board to users without a listing on the market; the page explains that instead of failing.
 */
@Component({
  selector: 'app-search-request-board',
  standalone: true,
  imports: [FormsModule, RouterModule, TranslateModule, SearchRequestSummaryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="sr-page container">
      <header class="sr-page__header">
        <h1>{{ (listingId() ? 'SEARCH_REQUESTS.DEMAND_TITLE' : 'SEARCH_REQUESTS.BOARD_TITLE') | translate }}</h1>
        <p class="sr-page__lead">{{ 'SEARCH_REQUESTS.BOARD_LEAD' | translate }}</p>
      </header>

      @if (!listingId()) {
        <div class="sr-filters">
          <label>{{ 'SEARCH_REQUESTS.TYPE' | translate }}
            <select [(ngModel)]="type" (ngModelChange)="reload()" name="type">
              <option [ngValue]="null">{{ 'SEARCH_REQUESTS.ANY' | translate }}</option>
              <option value="ForRent">{{ 'SEARCH_REQUESTS.TYPE_RENT' | translate }}</option>
              <option value="ForSale">{{ 'SEARCH_REQUESTS.TYPE_BUY' | translate }}</option>
            </select>
          </label>
          <label>{{ 'SEARCH_REQUESTS.GOVERNORATE' | translate }}
            <select [(ngModel)]="governorateId" (ngModelChange)="reload()" name="gov">
              <option [ngValue]="null">{{ 'SEARCH_REQUESTS.ANY' | translate }}</option>
              @for (g of governorates(); track g.id) { <option [ngValue]="g.id">{{ name(g) }}</option> }
            </select>
          </label>
        </div>
      }

      @if (forbidden()) {
        <p class="sr-empty" data-testid="sr-board-forbidden">{{ 'SEARCH_REQUESTS.BOARD_ADVERTISERS_ONLY' | translate }}
          <a routerLink="/property-form">{{ 'SEARCH_REQUESTS.PUBLISH_LISTING' | translate }}</a></p>
      } @else if (loading()) {
        <p role="status">{{ 'COMMON.LOADING' | translate }}</p>
      } @else if (!items().length) {
        <p class="sr-empty" data-testid="sr-board-empty">{{ 'SEARCH_REQUESTS.BOARD_EMPTY' | translate }}</p>
      }

      <ul class="sr-list">
        @for (item of items(); track item.request.id) {
          <li class="sr-card card" data-testid="sr-board-item">
            @if (item.score !== null) {
              <div class="sr-card__top"><span class="sr-status sr-status--active">{{ 'SEARCH_REQUESTS.SCORE' | translate: { score: item.score } }}</span></div>
            }
            <app-search-request-summary [request]="item.request" [governorates]="governorates()" />
            @if (item.reasons.length) {
              <p class="sr-match__reasons">@for (code of item.reasons; track code) { <span class="sr-reason">{{ ('SEARCH_REQUESTS.REASON.' + code) | translate }}</span> }</p>
            }
            <div class="sr-propose">
              @if (proposed().has(item.request.id)) {
                <span class="sr-match__badge">{{ 'SEARCH_REQUESTS.PROPOSAL_SENT' | translate }}</span>
              } @else if (listingId()) {
                <button type="button" class="btn btn-primary" (click)="propose(item.request.id, listingId()!)">{{ 'SEARCH_REQUESTS.PROPOSE' | translate }}</button>
              } @else if (myListings().length) {
                <label class="sr-visually-hidden" [attr.for]="'pick-' + item.request.id">{{ 'SEARCH_REQUESTS.PICK_LISTING' | translate }}</label>
                <select [id]="'pick-' + item.request.id" [(ngModel)]="picked[item.request.id]" [name]="'pick-' + item.request.id">
                  <option [ngValue]="undefined" disabled>{{ 'SEARCH_REQUESTS.PICK_LISTING' | translate }}</option>
                  @for (l of myListings(); track l.id) { <option [ngValue]="l.id">{{ l.title }}</option> }
                </select>
                <button type="button" class="btn btn-primary" [disabled]="!picked[item.request.id]" (click)="propose(item.request.id, picked[item.request.id]!)">
                  {{ 'SEARCH_REQUESTS.PROPOSE' | translate }}
                </button>
              }
            </div>
          </li>
        }
      </ul>

      @if (!listingId() && total() > items().length) {
        <button type="button" class="btn btn-secondary" (click)="more()">{{ 'SEARCH_REQUESTS.MORE' | translate }}</button>
      }
    </main>
  `,
  styleUrls: ['./search-requests.scss'],
  styles: [`.sr-visually-hidden { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }`]
})
export class SearchRequestBoardPage implements OnInit {
  private readonly api = inject(SearchRequestApiService);
  private readonly lookups = inject(LookupsApiService);
  private readonly properties = inject(PropertyApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly listingId = signal<string | null>(null);
  readonly rows = signal<{ request: AnonymousSearchRequest; score: number | null; reasons: string[] }[]>([]);
  readonly items = computed(() => this.rows());
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly forbidden = signal(false);
  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly myListings = signal<Property[]>([]);
  readonly proposed = signal<ReadonlySet<string>>(new Set());

  type: SearchRequestType | null = null;
  governorateId: number | null = null;
  picked: Record<string, string | undefined> = {};
  private page = 1;

  ngOnInit(): void {
    this.listingId.set(this.route.snapshot.paramMap.get('propertyId'));
    this.lookups.getGovernorates().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: g => this.governorates.set(g ?? []), error: () => undefined });
    if (!this.listingId()) {
      this.properties.getMyProperties().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: list => this.myListings.set((list ?? []).filter(p => p.isPublished !== false)),
        error: () => undefined
      });
    }
    this.reload();
  }

  name(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, currentUiLanguage() ?? 'ar');
  }

  reload(): void {
    this.page = 1;
    this.rows.set([]);
    this.fetch();
  }

  more(): void {
    this.page++;
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.forbidden.set(false);
    const id = this.listingId();
    if (id) {
      this.api.getForListing(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (list: ListingDemand[]) => {
          this.rows.set((list ?? []).map(d => ({ request: d.request, score: d.score, reasons: d.reasons ?? [] })));
          this.proposed.set(new Set((list ?? []).filter(d => d.alreadyProposed).map(d => d.request.id)));
          this.total.set(list?.length ?? 0);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
      return;
    }
    this.api.getBoard({ listingType: this.type, governorateId: this.governorateId, page: this.page })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.rows.update(rows => [...rows, ...(res?.items ?? []).map(request => ({ request, score: null, reasons: [] }))]);
          this.total.set(res?.totalCount ?? 0);
          this.loading.set(false);
        },
        error: (err: HttpErrorResponse) => {
          this.forbidden.set(err?.status === 403);
          this.loading.set(false);
        }
      });
  }

  propose(requestId: string, propertyId: string): void {
    this.api.propose(requestId, propertyId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.proposed.update(set => new Set([...set, requestId]));
        this.toast.success(this.translate.instant('SEARCH_REQUESTS.PROPOSAL_SENT'));
      },
      error: () => undefined
    });
  }
}
