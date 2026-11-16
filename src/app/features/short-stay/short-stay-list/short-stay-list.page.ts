import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { LocationNamesService } from '../../../core/api/location-names.service';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { EMPTY, Observable, Subject, catchError, merge, switchMap, tap } from 'rxjs';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { LookupAmenity, LookupsApiService, pickLocalizedName } from '../../../core/api/lookups-api.service';
import { PagedResult } from '../../../core/models/api.model';
import { GeoLocation, geoName } from '../../../core/models/geo-location.model';
import { AccommodationTypeDto, ShortStayListingSearchFilter, ShortStayListingSummary } from '../../../core/models/short-stay.model';
import { CurrencyRatesService } from '../../../core/pricing/currency-rates.service';
import { isMarketCurrency } from '../../../core/pricing/market-currencies';
import { LanguageService, LangCode } from '../../../core/services/language.service';
import { PreferencesService } from '../../../core/services/preferences.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { DateRangePickerComponent, DateRangeValue } from '../../../shared/ui/date-range-picker.component';
import { GeoPlaceFilterComponent } from '../../../shared/ui/geo/geo-place-filter.component';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { uiNumberLocale } from '../../../core/i18n/ui-language';
import { AmenityLabelPipe } from '../../../pipes/amenity-label.pipe';
import { ListingTitlePipe } from '../../../shared/pipes/listing-title.pipe';
import { ListingTitleTranslationBarComponent } from '../../../shared/ui/listing-title-translation-bar.component';
import { ListingViewCountComponent } from '../../../shared/ui/listing-view-count.component';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../../shared/pipes/localized-number.pipe';

/** The orders the list offers; the URL carries one of these words (nothing for the default, newest first). */
export type ShortStaySort = '' | 'priceAsc' | 'priceDesc';

@Component({
  selector: 'app-short-stay-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListingTitlePipe,
    ListingTitleTranslationBarComponent, LocalizedDatePipe, LocalizedNumberPipe,
    ListingViewCountComponent,
    AmenityLabelPipe,
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    EmptyStateComponent,
    SkeletonCardGridComponent,
    ImageFallbackDirective,
    DateRangePickerComponent,
    GeoPlaceFilterComponent
  ],
  templateUrl: './short-stay-list.page.html',
  styleUrls: ['./short-stay-list.page.scss']
})
export class ShortStayListPage implements OnInit {
  private readonly api = inject(ShortStayListingApiService);
  readonly locations = inject(LocationNamesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);
  private readonly injector = inject(Injector);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly currencyRates = inject(CurrencyRatesService);
  private readonly preferences = inject(PreferencesService);
  private readonly langService = inject(LanguageService);

  readonly listings = signal<ShortStayListingSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly totalCount = signal(0);
  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()) || 1);
  readonly hasNext = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevious = computed(() => this.currentPage() > 1);

  readonly fallbackImage = '/images/no-image.svg';
  readonly datePickerOpen = signal(false);

  readonly amenities = signal<LookupAmenity[]>([]);
  readonly accommodationTypes = signal<AccommodationTypeDto[]>([]);
  readonly currencies = this.currencyRates.currencies;
  /** The catalog place picked in the place box (shown as the box's text). */
  readonly locationPlace = signal<GeoLocation | null>(null);

  /** Bedroom choices of the filter: "at least N". */
  readonly bedroomChoices = [1, 2, 3, 4, 5];

  // The state below is a copy of the URL (see applyParamsToState) edited by the form; "search" writes it back.
  searchText = '';
  locationId: number | null = null;
  /**
   * A place typed as text and applied through the place box ("search «X» in listing addresses"): sent as `city`, which
   * the server matches in the listing's city and in the governorate's names, in Arabic and English.
   */
  addressText = '';
  checkIn: string | null = null;
  checkOut: string | null = null;
  guests: number | null = null;
  accommodationTypeId: number | null = null;
  minBedrooms: number | null = null;
  minPrice: number | null = null;
  maxPrice: number | null = null;
  currencyCode = '';
  instantOnly = false;
  sort: ShortStaySort = '';
  selectedAmenityIds: string[] = [];
  /** The amenities section is folded away until asked for (34 chips would fill the form). */
  amenitiesOpen = false;

  /** What is in the place box when it differs from what was applied; committed by "search" so typed text is never dropped. */
  private placeDraft: string | null = null;
  /** Set by an action of the person (search, reset, page change): once the answer is in, the results are brought into view. */
  private scrollToResultsWhenLoaded = false;
  private readonly reload$ = new Subject<void>();

  @ViewChild(GeoPlaceFilterComponent) private placeBox?: GeoPlaceFilterComponent;
  @ViewChild('resultsRegion') private resultsRegion?: ElementRef<HTMLElement>;

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.SHORT_STAY', '/short-stay', this.destroyRef);

    this.loadLookups();

    // The URL is the single source of truth, as on the property list: the first load, a shared link, "search", a page
    // change, "reset" and the browser's back and forward all arrive here as a query-param change. switchMap drops the
    // answer of a request that a newer one has replaced, so an older answer can never overwrite a newer one.
    const urlChanges$ = this.route.queryParamMap.pipe(tap(params => this.applyParamsToState(params)));

    merge(urlChanges$, this.reload$)
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set('');
        }),
        switchMap(() =>
          this.fetchPage().pipe(
            catchError(err => {
              this.error.set(this.loadErrorKey(err));
              this.loading.set(false);
              this.revealResultsIfRequested();
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => {
        if (!this.redirectToLastPageIfBeyond(result)) {
          this.applyResult(result);
          this.revealResultsIfRequested();
        }
      });
  }

  // ── lookups ──────────────────────────────────────────────────────────────────────────────────

  private loadLookups(): void {
    this.api.getAccommodationTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.accommodationTypes.set(items), error: () => this.accommodationTypes.set([]) });

    this.lookupsApi.getAmenities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.amenities.set(items), error: () => this.amenities.set([]) });

    this.currencyRates.load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.currencyCode) this.currencyCode = this.defaultCurrencyCode();
      });
  }

  /** The person's display currency when the list has it, otherwise the base currency (USD). */
  private defaultCurrencyCode(): string {
    const list = this.currencies();
    const preferred = this.preferences.currency;
    if (preferred && list.some(c => c.code === preferred)) return preferred;
    return list.find(c => c.isBase)?.code ?? list[0]?.code ?? '';
  }

  get currentLang(): LangCode { return this.langService.getCurrent(); }

  currencyLabel(currency: { code: string; nameAr: string; nameEn: string }): string {
    return `${currency.code} — ${pickLocalizedName(currency, this.langService.getCurrent())}`;
  }

  typeLabel(type: AccommodationTypeDto): string {
    return pickLocalizedName(type, this.langService.getCurrent());
  }

  // ── the form ─────────────────────────────────────────────────────────────────────────────────

  toggleDatePicker(): void {
    this.datePickerOpen.update(v => !v);
  }

  onRangeChange(value: DateRangeValue): void {
    this.checkIn = value.checkIn;
    this.checkOut = value.checkOut;
    if (value.checkIn && value.checkOut) {
      this.datePickerOpen.set(false);
    }
  }

  clearDates(): void {
    this.checkIn = null;
    this.checkOut = null;
  }

  onPlacePicked(place: GeoLocation | null): void {
    this.locationPlace.set(place);
    this.locationId = place?.id ?? null;
    // One box, one meaning: a catalog place and an address text never apply together.
    this.addressText = '';
    this.placeDraft = null;
  }

  onPlaceTextPicked(text: string): void {
    this.addressText = text.trim();
    this.locationId = null;
    this.locationPlace.set(null);
    this.placeDraft = null;
  }

  onPlaceTyped(text: string): void {
    this.placeDraft = text;
  }

  /** "Search" takes the place box as it looks: text left in it, neither picked nor chosen, is applied instead of dropped. */
  private commitPlaceDraft(): void {
    const draft = this.placeDraft?.trim();
    this.placeDraft = null;
    if (!draft) return;

    const current = this.locationPlace();
    const appliedLabel = current ? geoName(current, this.currentLang) : this.addressText;
    if (draft !== appliedLabel) this.onPlaceTextPicked(draft);
  }

  isAmenitySelected(amenityId: string): boolean {
    return this.selectedAmenityIds.includes(amenityId);
  }

  toggleAmenityFilter(amenityId: string): void {
    this.selectedAmenityIds = this.isAmenitySelected(amenityId)
      ? this.selectedAmenityIds.filter(id => id !== amenityId)
      : [...this.selectedAmenityIds, amenityId];
  }

  toggleAmenitiesSection(): void {
    this.amenitiesOpen = !this.amenitiesOpen;
  }

  /** A price bound is set, so the currency matters (and is sent). */
  get hasPriceFilter(): boolean {
    return this.minPrice !== null || this.maxPrice !== null;
  }

  get hasActiveFilters(): boolean {
    return !!(
      this.searchText.trim() || this.locationId || this.addressText.trim() || this.checkIn || this.guests ||
      this.accommodationTypeId || this.minBedrooms || this.hasPriceFilter || this.instantOnly || this.sort ||
      this.selectedAmenityIds.length > 0
    );
  }

  applyFilters(): void {
    this.commitPlaceDraft();
    this.datePickerOpen.set(false);
    this.scrollToResultsWhenLoaded = true;
    this.navigateWithCurrentState(1);
  }

  resetFilters(): void {
    this.searchText = '';
    this.locationId = null;
    this.addressText = '';
    this.locationPlace.set(null);
    this.placeDraft = null;
    this.placeBox?.reset();
    this.checkIn = null;
    this.checkOut = null;
    this.guests = null;
    this.accommodationTypeId = null;
    this.minBedrooms = null;
    this.minPrice = null;
    this.maxPrice = null;
    this.currencyCode = this.defaultCurrencyCode();
    this.instantOnly = false;
    this.sort = '';
    this.selectedAmenityIds = [];
    this.datePickerOpen.set(false);
    this.scrollToResultsWhenLoaded = true;
    this.navigateWithCurrentState(1);
  }

  // ── URL <-> state ────────────────────────────────────────────────────────────────────────────

  /**
   * The URL is user-editable: every value is brought back into range here, because the server would refuse it (422)
   * or answer an empty page. A stay that starts in the past (an old bookmark) is dropped rather than refused.
   */
  private applyParamsToState(params: ParamMap): void {
    this.searchText = (params.get('search') ?? '').slice(0, 200);
    this.addressText = (params.get('city') ?? '').slice(0, 100);
    this.applyLocationFromUrl(params.get('locationId'));
    if (this.placeDraft !== null) {
      this.placeDraft = null;
      this.placeBox?.reset();
    }

    const checkIn = this.validDate(params.get('checkIn'));
    const checkOut = this.validDate(params.get('checkOut'));
    const stayIsValid = !!checkIn && !!checkOut && checkOut > checkIn && checkIn >= this.todayIso();
    this.checkIn = stayIsValid ? checkIn : null;
    this.checkOut = stayIsValid ? checkOut : null;

    this.guests = this.wholeNumber(params.get('guests'), 1, 100);
    this.accommodationTypeId = this.wholeNumber(params.get('type'), 1, 1_000_000);
    this.minBedrooms = this.wholeNumber(params.get('bedrooms'), 1, 50);
    this.minPrice = this.nonNegativeNumber(params.get('minPrice'));
    this.maxPrice = this.nonNegativeNumber(params.get('maxPrice'));
    // A bookmark may carry a currency that is no longer searchable (the server answers 422): use the default instead.
    const urlCurrency = (params.get('currency') ?? '').trim().toUpperCase();
    this.currencyCode = isMarketCurrency(urlCurrency) ? urlCurrency : this.defaultCurrencyCode();
    this.instantOnly = params.get('instant') === '1';
    const sort = params.get('sort');
    this.sort = sort === 'priceAsc' || sort === 'priceDesc' ? sort : '';
    this.selectedAmenityIds = params.getAll('amenityIds').filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20);

    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.get('pageSize'))) || 20));
    this.pageSize.set(pageSize);
    this.currentPage.set(Math.min(1000, Math.max(1, Math.trunc(Number(params.get('page'))) || 1)));
  }

  /** Restores the place box after a reload or a shared link: only the id is in the URL, the name comes from the catalog. */
  private applyLocationFromUrl(raw: string | null): void {
    const id = raw ? Math.trunc(Number(raw)) : 0;
    this.locationId = id > 0 ? id : null;
    if (!this.locationId) {
      this.locationPlace.set(null);
      return;
    }
    if (this.locationPlace()?.id === this.locationId) return;
    this.injector.get(LocationsApiService).get(this.locationId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: place => this.locationPlace.set(place), error: () => this.locationPlace.set(null) });
  }

  private validDate(value: string | null): string | null {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : value;
  }

  private wholeNumber(value: string | null, min: number, max: number): number | null {
    if (value === null || value.trim() === '') return null;
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }

  private nonNegativeNumber(value: string | null): number | null {
    if (value === null || value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  private todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  private buildFilterFromState(page: number): ShortStayListingSearchFilter {
    return {
      searchTerm: this.searchText.trim() || undefined,
      city: this.addressText.trim() || undefined,
      locationId: this.locationId ?? undefined,
      accommodationTypeId: this.accommodationTypeId ?? undefined,
      checkIn: this.checkIn ?? undefined,
      checkOut: this.checkOut ?? undefined,
      guests: this.guests ?? undefined,
      minBedrooms: this.minBedrooms ?? undefined,
      instantBooking: this.instantOnly ? true : undefined,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : undefined,
      minPrice: this.minPrice ?? undefined,
      maxPrice: this.maxPrice ?? undefined,
      currencyCode: this.hasPriceFilter && this.currencyCode ? this.currencyCode : undefined,
      sortBy: this.sort ? 'price' : undefined,
      sortDescending: this.sort === 'priceDesc' ? true : undefined,
      page,
      pageSize: this.pageSize()
    };
  }

  private fetchPage(): Observable<PagedResult<ShortStayListingSummary>> {
    return this.api.search(this.buildFilterFromState(this.currentPage()));
  }

  /**
   * Pushes the form's state into the URL (replacing it, not merging: an empty value is dropped). The queryParamMap
   * subscription in ngOnInit does the fetch, so this is the one place that turns an action into a request.
   */
  private navigateWithCurrentState(page: number, replaceUrl = false): void {
    const queryParams: Record<string, string | number | string[] | null> = {
      search: this.searchText.trim() || null,
      city: this.addressText.trim() || null,
      locationId: this.locationId ?? null,
      checkIn: this.checkIn,
      checkOut: this.checkOut,
      guests: this.guests ?? null,
      type: this.accommodationTypeId ?? null,
      bedrooms: this.minBedrooms ?? null,
      minPrice: this.minPrice ?? null,
      maxPrice: this.maxPrice ?? null,
      currency: this.hasPriceFilter && this.currencyCode ? this.currencyCode : null,
      instant: this.instantOnly ? 1 : null,
      sort: this.sort || null,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : null,
      page: page > 1 ? page : null,
      pageSize: this.pageSize() !== 20 ? this.pageSize() : null
    };

    // The router ignores a navigation to the URL it is already on, so nothing would load or scroll and the button would
    // look dead: when the URL would not change, the same search is simply run again.
    const target = this.router.serializeUrl(this.router.createUrlTree([], { relativeTo: this.route, queryParams }));
    if (target === this.router.url) {
      this.currentPage.set(page);
      this.reload$.next();
      return;
    }

    this.router.navigate([], replaceUrl ? { relativeTo: this.route, queryParams, replaceUrl } : { relativeTo: this.route, queryParams });
  }

  // ── results ──────────────────────────────────────────────────────────────────────────────────

  /**
   * A refusal of the filters themselves (422/400: an inverted price range, dates in the past, a character the server
   * will not search for) is the reader's to fix and is worded as such; anything else is "try again".
   */
  private loadErrorKey(err: unknown): string {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    return status === 422 || status === 400 ? 'SHORTSTAY.LIST.INVALID_FILTERS' : 'SHORTSTAY.LIST.LOAD_ERROR';
  }

  /** A shared link may ask for a page past the end: land on the last real page instead of an empty list. */
  private redirectToLastPageIfBeyond(result: PagedResult<ShortStayListingSummary>): boolean {
    if (result.items.length > 0 || result.totalCount <= 0) return false;

    const size = result.pageSize || this.pageSize();
    const lastPage = Math.max(1, Math.ceil(result.totalCount / size));
    if (result.page <= lastPage) return false;

    this.navigateWithCurrentState(lastPage, true);
    return true;
  }

  private applyResult(result: PagedResult<ShortStayListingSummary>): void {
    this.listings.set(result.items);
    this.totalCount.set(result.totalCount);
    this.currentPage.set(result.page);
    this.pageSize.set(result.pageSize);
    this.loading.set(false);
  }

  /**
   * After an action of the person the top of the results (or the "nothing matches" message) is brought into view and
   * focused, so the effect of the button is never out of sight, and a new page starts at the top of its list.
   */
  private revealResultsIfRequested(): void {
    if (!this.scrollToResultsWhenLoaded) return;
    this.scrollToResultsWhenLoaded = false;
    // One macrotask later: the change detection that paints the new results (or the message) has run by then.
    const timer = setTimeout(() => {
      const region = this.resultsRegion?.nativeElement;
      if (!region) return;
      region.scrollIntoView({ block: 'start' });
      region.focus({ preventScroll: true });
    }, 0);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  /** Re-runs the current search without touching the URL: the error state's Retry button. */
  retry(): void {
    this.reload$.next();
  }

  goToPage(page: number): void {
    const safePage = Math.max(1, Math.min(Number(page) || 1, this.totalPages()));
    this.scrollToResultsWhenLoaded = true;
    this.navigateWithCurrentState(safePage);
  }

  nextPage(): void { if (this.hasNext()) this.goToPage(this.currentPage() + 1); }
  prevPage(): void { if (this.hasPrevious()) this.goToPage(this.currentPage() - 1); }

  /** The listing's page, with the dates and guests of the search, so the booking form opens already filled in. */
  goToDetails(id: string): void {
    const queryParams: Record<string, string | number> = {};
    if (this.checkIn && this.checkOut) {
      queryParams['checkIn'] = this.checkIn;
      queryParams['checkOut'] = this.checkOut;
    }
    if (this.guests) queryParams['guests'] = this.guests;
    this.router.navigate(['/short-stay', id], { queryParams });
  }

  trackById(_: number, listing: ShortStayListingSummary): string {
    return listing.id;
  }

  formatPrice(listing: ShortStayListingSummary): string {
    if (listing.fromPricePerNight === null) return '—';
    try {
      return new Intl.NumberFormat(uiNumberLocale(), {
        style: 'currency', currency: listing.currencyCode, maximumFractionDigits: 0
      }).format(listing.fromPricePerNight);
    } catch {
      return `${listing.fromPricePerNight.toLocaleString(uiNumberLocale())} ${listing.currencyCode}`;
    }
  }
}
