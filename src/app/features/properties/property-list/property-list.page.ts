// =============================================================
// src/app/features/properties/property-list/property-list.page.ts
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  ElementRef,
  Injector,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LocationNamesService } from '../../../core/api/location-names.service';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, catchError, debounceTime, EMPTY, fromEvent, merge, Observable, switchMap, tap } from 'rxjs';

import { PropertyApiService } from '../../../core/api/property-api.service';
import { SavedSearchApiService } from '../../../core/api/saved-search-api.service';
import {
  LookupsApiService,
  LookupAmenity,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LangCode, LanguageService } from '../../../core/services/language.service';
import { PagedResult } from '../../../core/models/api.model';
import { Property, PropertyFilterDto } from '../../../core/models/property.model';
import { HttpErrorResponse } from '@angular/common/http';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { PropertyShareButtonComponent } from '../../../shared/ui/property-share-button.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { UrlService } from '../../../core/services/url.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FavoriteToggleButtonComponent } from '../../../shared/ui/favorite-toggle-button.component';
import { StructuredDataService, BREADCRUMB_JSON_LD_ID } from '../../../core/services/structured-data.service';
import { PropertyShareUrlService } from '../../../core/sharing/property-share-url.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { formatListingPrice, primaryListingPrice } from '../../../shared/utils/listing-price';
import { isReservedListing } from '../../../shared/utils/listing-status';
import { CurrencyRatesService } from '../../../core/pricing/currency-rates.service';
import { isMarketCurrency } from '../../../core/pricing/market-currencies';
import { PreferencesService } from '../../../core/services/preferences.service';
import { InterestAreasService } from '../../../core/services/interest-areas.service';
import { RecentAreasService } from '../../../core/services/recent-areas.service';
import { AmenityLabelPipe } from '../../../pipes/amenity-label.pipe';
import { AdSlotComponent } from '../../../core/ads/ad-slot.component';
import { ListingTitlePipe } from '../../../shared/pipes/listing-title.pipe';
import { ListingTitleTranslationBarComponent } from '../../../shared/ui/listing-title-translation-bar.component';
import { ListingViewCountComponent } from '../../../shared/ui/listing-view-count.component';
import { listSeparator } from '../../../core/i18n/ui-language';
import { GeoPlaceFilterComponent } from '../../../shared/ui/geo/geo-place-filter.component';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoLocation, geoName } from '../../../core/models/geo-location.model';
import { ComboBoxComponent, ComboOption } from '../../../shared/ui/combo-box.component';

@Component({
  selector: 'app-property-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListingTitlePipe,
    ListingTitleTranslationBarComponent,
    AdSlotComponent,
    ComboBoxComponent,
    ListingViewCountComponent,
    AmenityLabelPipe,
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    EmptyStateComponent,
    SkeletonCardGridComponent,
    ImageFallbackDirective,
    FavoriteToggleButtonComponent,
    PropertyShareButtonComponent,
    GeoPlaceFilterComponent
  ],
  templateUrl: './property-list.page.html',
  styleUrls: ['./property-list.page.scss']
})
export class PropertyListPage implements OnInit {
  /** يطابق $bp-tablet في _breakpoints.scss — نقطة الكسر التي يتحوّل عندها
   *  .filter-sidebar من Overlay كامل الشاشة إلى شريط جانبي ثابت (property-list.page.scss). */
  private static readonly DESKTOP_BREAKPOINT_PX = 980;

  /** The deepest row the API will page to (PropertyFilterDtoValidator.MaxResultDepth). */
  private static readonly MAX_RESULT_DEPTH = 10_000;

  private readonly api = inject(PropertyApiService);
  private readonly savedSearchApi = inject(SavedSearchApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly locations = inject(LocationNamesService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly langService = inject(LanguageService);
  /** The place catalog is only asked when a link carries a place, so the list renders without it otherwise. */
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly overlayBackHandlers = inject(OverlayBackHandlerService);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly urlService = inject(UrlService);
  private readonly structuredData = inject(StructuredDataService);
  private readonly shareUrl = inject(PropertyShareUrlService);
  private readonly pageMeta = inject(PageMetaService);
  private readonly currencyRates = inject(CurrencyRatesService);
  private readonly preferences = inject(PreferencesService);
  private readonly interestAreas = inject(InterestAreasService);
  private readonly recentAreas = inject(RecentAreasService);

  readonly properties = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly totalCount = signal(0);
  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()) || 1);
  readonly hasNext = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevious = computed(() => this.currentPage() > 1);

  readonly fallbackImage = '/images/no-image.svg';

  /**
   * Runs the current query again without a URL change: "near me" switched on or off, a new radius, the error
   * state's Retry, and "apply" when nothing in the URL changed but the mode did. Feeds the same cancelling
   * pipeline as the URL, so two requests are never in flight for one screen.
   */
  private readonly reload$ = new Subject<void>();

  /**
   * ✅ إضافة: فلترة حسب المرافق — الباك اند يدعم فعلياً AmenityIds ضمن
   * PropertyFilterDto (راجع PropertyFilterDto.cs) لكن لم يكن هناك أي واجهة
   * لاختيار المرافق وإرسالها ضمن البحث. تُجلب من نفس مصدر Lookups المستخدَم
   * أصلاً في نموذج إضافة/تعديل العقار.
   */
  readonly amenities = signal<LookupAmenity[]>([]);
  selectedAmenityIds: string[] = [];

  /**
   * Phase-0, Task 0 follow-up: structured location + property-type filters,
   * mirroring the same cascading dropdowns added to property-form.page.ts.
   */
  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly neighborhoods = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypeCatalog = signal<PropertyTypeLookup[]>([]);
  governorateId: number | null = null;
  /** A catalog place of any level chosen in the "specific place" box; the API filters by everything inside it. */
  locationId: number | null = null;
  readonly locationPlace = signal<GeoLocation | null>(null);
  districtId: number | null = null;
  neighborhoodId: number | null = null;
  /**
   * A district / neighborhood the person typed because it is not in the lists. There is no id to filter by, so
   * the words go through the keyword search, which already looks at the stored city, district and neighborhood
   * text of every listing (Arabic spellings folded together).
   */
  districtText = '';
  neighborhoodText = '';
  /**
   * A place typed as text and applied through the place box ("search «X» in listing addresses"): a street or a city
   * the catalog does not hold. Sent as `placeText`, where every word must be found (it narrows, it never widens).
   */
  addressText = '';
  /** What is in the place box right now when it differs from what was applied; committed by "apply" so nothing typed is silently ignored. null = untouched. */
  private placeDraft: string | null = null;
  propertyTypeId: number | null = null;

  @ViewChild(GeoPlaceFilterComponent) private placeBox?: GeoPlaceFilterComponent;
  /** The amenities section is folded away until asked for (34 chips used to fill a third of the panel). */
  amenitiesOpen = false;

  @ViewChild('plResults') private resultsRegion?: ElementRef<HTMLElement>;
  /** Set by "apply filters": the next answer (results, nothing found, or an error) is brought into view. */
  private scrollToResultsWhenLoaded = false;

  private readonly lang = signal<LangCode>(this.langService.getCurrent());

  /** The lists shown in the language of the page, rebuilt when the language or the lookups change. */
  readonly districtOptions = computed<ComboOption[]>(() =>
    this.districts().map(d => ({ value: d.id, label: pickLocalizedName(d, this.lang()) })));
  readonly neighborhoodOptions = computed<ComboOption[]>(() =>
    this.neighborhoods().map(n => ({ value: n.id, label: pickLocalizedName(n, this.lang()) })));

  /** Phase-0, Task 3 — "save this search" button state. */
  readonly savingSearch = signal(false);

  // ── Geo-search ("العقارات القريبة مني") ──
  // يستخدم GET /properties/geo-search الذي كان غير مستغَل إطلاقاً في الواجهة
  // رغم أن الخادم يوفره بفهرسة PostGIS مخصصة لهذا الغرض.
  readonly geoModeActive = signal(false);
  readonly geoLoading = signal(false);
  /** Where the person is while "near me" is on. Kept here (never in the URL: a shared link must not carry a home address). */
  private readonly geoCoords = signal<{ latitude: number; longitude: number } | null>(null);
  radiusKm = 5;

  /**
   * The currency the price range is written in (P7-D01). The server compares every listing in this
   * currency whatever it was advertised in, so "up to 100,000 SYP" also finds a flat priced in
   * dollars at its equivalent. Starts as the person's display currency; sent only with a price.
   */
  readonly currencies = this.currencyRates.currencies;
  currencyCode = '';
  /** Why the last "apply" did nothing (an inverted range), shown under the price fields. */
  readonly filterError = signal('');

  filtersOpen = false;
  searchText = '';
  selectedListingType: '' | 'ForRent' | 'ForSale' = '';
  cityFilter = '';
  minPrice: number | null = null;
  maxPrice: number | null = null;
  sortBy = 'CreatedAt';

  ngOnInit(): void {
    const unregister = this.overlayBackHandlers.register(() => {
      if (!this.filtersOpen) return false;
      this.closeFilters();
      return true;
    });
    this.destroyRef.onDestroy(unregister);

    const siteOrigin = this.shareUrl.getSiteOrigin();
    // Always the clean base path, never including this load's actual filter query params --
    // see MetaService.setPropertiesListMeta's doc comment for why (consolidates every filtered
    // /properties?city=...&minPrice=... variant onto one canonical URL). The wording follows the
    // UI language (SEO.PROPERTIES.*): the tab title used to stay Arabic in English and German (P7-D06).
    this.pageMeta.applyTranslated('SEO.PROPERTIES', '/properties', this.destroyRef);
    this.structuredData.setJsonLd(
      BREADCRUMB_JSON_LD_ID,
      this.structuredData.buildBreadcrumbList([
        { name: 'الرئيسية', url: `${siteOrigin}/` },
        { name: 'العقارات', url: `${siteOrigin}/properties` }
      ])
    );
    this.destroyRef.onDestroy(() => this.structuredData.removeJsonLd(BREADCRUMB_JSON_LD_ID));

    // نفس منطق الـ Drawer الرئيسي بالـ Navbar: قفل تمرير الصفحة الخلفية
    // أثناء فتح فلاتر الجوال (Overlay كامل الشاشة عبر @include bp.tablet)،
    // ورفعه بأمان لو انهدم المكوّن (تغيير route) والفلاتر ما زالت مفتوحة.
    this.destroyRef.onDestroy(() => {
      this.scrollLock.forceUnlockIfHeldBy(this.filtersOpen);
    });

    // Edge case: تدوير جهاز قابل للطي (أو تكبير نافذة) أثناء فتح فلاتر
    // الجوال قد يعبر بالعرض فوق نقطة الكسر، فيتحوّل .filter-sidebar من
    // Overlay إلى شريط جانبي ثابت مرئي دائمًا — القفل حينها يمنع تمرير
    // الصفحة بلا مبرر. debounceTime لتفادي تبديل الحالة أثناء السحب
    // المستمر لحواف نافذة المتصفح.
    fromEvent(window, 'resize')
      .pipe(debounceTime(150), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.filtersOpen && window.innerWidth > PropertyListPage.DESKTOP_BREAKPOINT_PX) {
          this.closeFilters();
        }
      });

    this.langService.currentLang$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(lang => this.lang.set(lang));

    this.loadCurrencies();
    this.loadAmenities();
    this.loadGovernorates();
    this.loadPropertyTypeCatalog();

    // Phase 3: the URL is the single source of truth for search/filter/pagination
    // state — this subscription (not a one-time snapshot read) drives every load:
    // initial page load, a deep link (home hero search / saved search), a filter
    // panel "apply", a page change, Reset, and browser back/forward navigation all
    // funnel through here as a query-param change. switchMap cancels an in-flight
    // request if a newer one starts before it resolves (race-condition guard).
    const urlChanges$ = this.route.queryParamMap.pipe(
      tap(params => {
        this.applyParamsToState(params);
        // A governorate the person searched in is remembered on this device (never sent to the server as a log).
        this.recentAreas.record(this.governorateId);
      })
    );

    merge(urlChanges$, this.reload$)
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set('');
        }),
        switchMap(() =>
          this.fetchPage(this.currentPage()).pipe(
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

  /** The list, or - while "near me" is on - the listings around the person, with the same filters either way. */
  private fetchPage(page: number): Observable<PagedResult<Property>> {
    const coords = this.geoModeActive() ? this.geoCoords() : null;
    return coords
      ? this.api.geoSearch(coords.latitude, coords.longitude, this.radiusKm, this.buildGeoFilter(page))
      : this.api.getPropertiesPaged(this.buildFilterFromState(page));
  }

  /**
   * A refusal of the filters themselves (422/400: an inverted range, a character the server will
   * not search for) is the reader's to fix and is worded as such; anything else is "try again".
   */
  private loadErrorKey(err: unknown): string {
    const status = err instanceof HttpErrorResponse ? err.status : 0;
    return status === 422 || status === 400 ? 'PROPERTY_LIST.INVALID_FILTERS' : 'PROPERTY_LIST.LOAD_ERROR';
  }

  /**
   * A shared or edited link can ask for a page past the end (?page=99999). Sites such as Zillow and
   * Rightmove land on the last real page instead of an empty list under a "3078 results" heading.
   * Returns true when it navigated, so the caller does not render the empty page first.
   */
  private redirectToLastPageIfBeyond(result: PagedResult<Property>): boolean {
    if (result.items.length > 0 || result.totalCount <= 0) {
      return false;
    }

    const size = result.pageSize || this.pageSize();
    const lastPage = Math.max(1, Math.ceil(result.totalCount / size));
    if (result.page <= lastPage) {
      return false;
    }

    this.navigateWithCurrentState(lastPage, true);
    return true;
  }

  /** GET /api/lookups/currencies — the currencies the price range can be written in. */
  private loadCurrencies(): void {
    this.currencyRates
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.currencyCode) {
          this.currencyCode = this.defaultCurrencyCode();
        }
      });
  }

  /** The person's display currency when the list has it, otherwise the base currency (USD). */
  private defaultCurrencyCode(): string {
    const list = this.currencies();
    const preferred = this.preferences.currency;

    if (preferred && list.some(c => c.code === preferred)) {
      return preferred;
    }

    return list.find(c => c.isBase)?.code ?? list[0]?.code ?? '';
  }

  /** Name of a currency in the UI language, for the selector. */
  currencyLabel(currency: { code: string; nameAr: string; nameEn: string }): string {
    return `${currency.code} — ${pickLocalizedName(currency, this.langService.getCurrent())}`;
  }

  /** GET /api/lookups/governorates — Phase-0, Task 0 follow-up. */
  private loadGovernorates(): void {
    this.lookupsApi
      .getGovernorates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.governorates.set(items), error: () => this.governorates.set([]) });
  }

  /** GET /api/lookups/property-type-catalog — Phase-0, Task 0 follow-up. */
  private loadPropertyTypeCatalog(): void {
    this.lookupsApi
      .getPropertyTypeCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.propertyTypeCatalog.set(items), error: () => this.propertyTypeCatalog.set([]) });
  }

  /** Cascading dropdown handler — mirrors property-form.page.ts's bindCascadingLocationChanges. */
  get currentLang(): LangCode { return this.langService.getCurrent(); }

  /** The "specific place" box: a place replaces the older governorate/district/neighborhood narrowing. */
  onPlaceFilterPicked(place: GeoLocation | null): void {
    this.locationPlace.set(place);
    this.locationId = place?.id ?? null;
    // One box, one meaning: a catalog place and an address text never apply together.
    this.addressText = '';
    this.placeDraft = null;
    if (place) {
      this.governorateId = null;
      this.districtId = null;
      this.neighborhoodId = null;
      this.districtText = '';
      this.neighborhoodText = '';
      this.cityFilter = '';
      this.districts.set([]);
      this.neighborhoods.set([]);
    }
  }

  /** "Search «X» in listing addresses": the street or city the catalog does not know, applied as a text that must be found. */
  onPlaceTextPicked(text: string): void {
    this.addressText = text.trim();
    this.locationId = null;
    this.locationPlace.set(null);
    this.placeDraft = null;
  }

  /** What the person has typed in the place box so far (applied, if still there, when they press "apply"). */
  onPlaceTyped(text: string): void {
    this.placeDraft = text;
  }

  /**
   * "Apply" takes the place box as it looks: text left in it that was neither picked from the list nor chosen as an
   * address search is applied as an address search, instead of being dropped without a word.
   */
  private commitPlaceDraft(): void {
    const draft = this.placeDraft?.trim();
    this.placeDraft = null;
    if (!draft) return;

    const current = this.locationPlace();
    const appliedLabel = current ? geoName(current, this.currentLang) : this.addressText;
    if (draft !== appliedLabel) this.onPlaceTextPicked(draft);
  }

  /** Restores the box after a reload or a shared link: only the id is in the URL, the name comes from the catalog. */
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

  onGovernorateChange(): void {
    // The free-text city is a second, unrelated way to name the same place — keeping a city
    // typed for the previous governorate would send a contradictory combination that can only
    // return nothing.
    this.cityFilter = '';
    this.districtId = null;
    this.neighborhoodId = null;
    this.districtText = '';
    this.neighborhoodText = '';
    this.locationId = null;
    this.locationPlace.set(null);
    this.districts.set([]);
    this.neighborhoods.set([]);

    if (this.governorateId) {
      this.lookupsApi.getDistricts(this.governorateId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: items => this.districts.set(items), error: () => this.districts.set([]) });
    }
  }

  onDistrictChange(): void {
    this.neighborhoodId = null;
    this.neighborhoods.set([]);

    if (this.districtId) {
      this.lookupsApi.getNeighborhoods(this.districtId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: items => this.neighborhoods.set(items), error: () => this.neighborhoods.set([]) });
    }
  }

  /**
   * The city is no longer a field of the panel (the governorate and the place box say the same thing in a way the
   * catalog can check), but a link or saved search may still carry one: it stays in force, shown as a chip that
   * can be removed, so a filter is never active without being visible.
   */
  removeCityFilter(): void {
    this.cityFilter = '';
  }

  // The typed words are kept exactly as typed (a space between two words must survive); they are trimmed where used.
  onDistrictTyped(text: string | null): void {
    this.districtText = text ?? '';
    if (this.districtText.trim()) this.districtId = null;
  }

  onNeighborhoodTyped(text: string | null): void {
    this.neighborhoodText = text ?? '';
    if (this.neighborhoodText.trim()) this.neighborhoodId = null;
  }

  /** Localized label for a bilingual lookup item, matching the current UI language. */
  localizedName(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, this.langService.getCurrent());
  }

  /**
   * Phase 3 — the URL is the single source of truth for search/filter/pagination
   * state. Called on every queryParamMap emission (initial load, a deep link from
   * the home hero search / saved-searches's runSearch(), an in-page filter apply,
   * a page change, Reset, or browser back/forward) to sync the filter-panel's UI
   * fields and pagination signals from the current URL before the matching
   * request is fired.
   */
  private applyParamsToState(params: ParamMap): void {
    this.searchText = params.get('search') ?? '';
    this.cityFilter = params.get('city') ?? '';
    this.minPrice = params.get('minPrice') ? Number(params.get('minPrice')) : null;
    this.maxPrice = params.get('maxPrice') ? Number(params.get('maxPrice')) : null;
    const listingType = params.get('listingType');
    this.selectedListingType = listingType === 'ForRent' || listingType === 'ForSale' ? listingType : '';
    this.selectedAmenityIds = params.getAll('amenityIds');
    this.sortBy = params.get('sort') ?? 'CreatedAt';
    // A bookmark or saved search may carry a currency that is no longer searchable (the server
    // answers 422 for it): fall back to the default instead.
    const urlCurrency = (params.get('currency') ?? '').trim().toUpperCase();
    this.currencyCode = isMarketCurrency(urlCurrency) ? urlCurrency : this.defaultCurrencyCode();

    this.governorateId = params.get('governorateId') ? Number(params.get('governorateId')) : null;
    this.applyLocationFromUrl(params.get('locationId'));
    this.districtId = params.get('districtId') ? Number(params.get('districtId')) : null;
    this.neighborhoodId = params.get('neighborhoodId') ? Number(params.get('neighborhoodId')) : null;
    this.districtText = params.get('districtText') ?? '';
    this.neighborhoodText = params.get('neighborhoodText') ?? '';
    this.addressText = params.get('placeText') ?? '';
    if (this.placeDraft !== null) {
      this.placeDraft = null;
      this.placeBox?.reset();
    }
    this.propertyTypeId = params.get('propertyTypeId') ? Number(params.get('propertyTypeId')) : null;

    // The URL is user-editable: a page or size that is not a whole number in range would be refused
    // by the server (422) or answer an empty page, so it is brought back into range here.
    const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(params.get('pageSize'))) || 20));
    const deepestPage = Math.max(1, Math.floor(PropertyListPage.MAX_RESULT_DEPTH / pageSize));
    this.pageSize.set(pageSize);
    this.currentPage.set(Math.min(deepestPage, Math.max(1, Math.trunc(Number(params.get('page'))) || 1)));

    // Pre-load the cascading dropdown options that match the incoming ids so
    // the filter panel shows correct labels, not just empty selects.
    if (this.governorateId) {
      this.lookupsApi.getDistricts(this.governorateId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: items => this.districts.set(items), error: () => this.districts.set([]) });
    }
    if (this.districtId) {
      this.lookupsApi.getNeighborhoods(this.districtId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: items => this.neighborhoods.set(items), error: () => this.neighborhoods.set([]) });
    }
  }

  /**
   * The words of the place the person typed, all of which must be found: the address text from the place box and
   * the district / neighborhood names typed by hand. (The keyword box is separate: there one word is enough.)
   */
  private placeTextFilter(): string {
    return [this.addressText, this.districtText, this.neighborhoodText].map(t => t.trim()).filter(Boolean).join(' ');
  }

  /** Builds the request DTO sent to the API from the filter panel's current UI-bound state. */
  private buildFilterFromState(page: number): PropertyFilterDto {
    const sort = this.mapSort();

    return {
      page,
      pageSize: this.pageSize(),
      searchTerm: this.searchText.trim() || undefined,
      placeText: this.placeTextFilter() || undefined,
      city: this.cityFilter.trim() || undefined,
      listingType: this.selectedListingType || undefined,
      minPrice: this.minPrice ?? undefined,
      maxPrice: this.maxPrice ?? undefined,
      currencyCode: this.hasPriceFilter && this.currencyCode ? this.currencyCode : undefined,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : undefined,
      sortBy: sort.sortBy,
      sortDescending: sort.sortDescending,
      // Only the default order is ranked, and only without a governorate filter (inside one governorate there
      // is nothing to favour); sending it otherwise would only split the shared response cache.
      interestGovernorateIds: sort.sortBy === 'CreatedAt' && !this.governorateId ? this.interestAreas.current() : undefined,
      governorateId: this.governorateId ?? undefined,
      districtId: this.districtId ?? undefined,
      neighborhoodId: this.neighborhoodId ?? undefined,
      locationId: this.locationId ?? undefined,
      propertyTypeId: this.propertyTypeId ?? undefined
    };
  }

  /** The filters "near me" understands: all of the list's, except the ordering (nearest first) and the interest ranking. */
  private buildGeoFilter(page: number): PropertyFilterDto {
    const { sortBy: _sortBy, sortDescending: _sortDescending, interestGovernorateIds: _interest, ...filter } = this.buildFilterFromState(page);
    return filter;
  }

  /**
   * Pushes the filter panel's current UI-bound state into the URL as query
   * params (replacing, not merging — an omitted/null param is dropped rather
   * than left dangling from a previous filter). The queryParamMap subscription
   * in ngOnInit reacts to the resulting navigation and performs the actual
   * fetch, so this is the one place that turns a user action into a request.
   */
  private navigateWithCurrentState(page: number, replaceUrl = false, forceReload = false): void {
    this.foldGovernorateNameIntoGovernorateFilter();
    const queryParams: Record<string, string | number | string[] | null> = {
      search: this.searchText.trim() || null,
      city: this.cityFilter.trim() || null,
      listingType: this.selectedListingType || null,
      minPrice: this.minPrice ?? null,
      maxPrice: this.maxPrice ?? null,
      currency: this.hasPriceFilter && this.currencyCode ? this.currencyCode : null,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : null,
      sort: this.sortBy && this.sortBy !== 'CreatedAt' ? this.sortBy : null,
      governorateId: this.governorateId ?? null,
      districtId: this.districtId ?? null,
      neighborhoodId: this.neighborhoodId ?? null,
      districtText: this.districtText.trim() || null,
      neighborhoodText: this.neighborhoodText.trim() || null,
      placeText: this.addressText.trim() || null,
      locationId: this.locationId ?? null,
      propertyTypeId: this.propertyTypeId ?? null,
      page: page > 1 ? page : null,
      pageSize: this.pageSize() !== 20 ? this.pageSize() : null
    };

    // The router ignores a navigation to the URL it is already on, so nothing would load or scroll: the button would
    // look dead. When the URL would not change, the results are either re-run (the mode changed) or simply shown.
    const target = this.router.serializeUrl(this.router.createUrlTree([], { relativeTo: this.route, queryParams }));
    if (target === this.router.url) {
      if (forceReload) {
        this.currentPage.set(page);
        this.reload$.next();
      } else {
        this.revealResultsIfRequested();
      }
      return;
    }

    this.router.navigate([], replaceUrl ? { relativeTo: this.route, queryParams, replaceUrl } : { relativeTo: this.route, queryParams });
  }

  /**
   * A city that is exactly a governorate's name (typed, or picked from the suggestions, which start
   * with the governorate's own names) names that governorate, not a place inside it. The API matches
   * the free-text City as a substring, so "دمشق" would also return "ريف دمشق" listings and miss the
   * ones stored as "Damascus"; the governorate filter matches by id and also covers old listings
   * that only have the text. So it is sent as the governorate filter instead of as the city.
   * Naming a different governorate than the selected one switches to it (the area and neighborhood
   * chosen under the old one no longer apply): the typed name is the latest thing the user said, and
   * the alternative, a city inside another governorate, can only return nothing.
   */
  private foldGovernorateNameIntoGovernorateFilter(): void {
    const typed = this.cityFilter.trim().toLowerCase();
    if (!typed) return;

    const named = this.governorates().find(
      g => g.nameAr?.trim().toLowerCase() === typed || g.nameEn?.trim().toLowerCase() === typed || g.nameDe?.trim().toLowerCase() === typed
    );
    if (!named) return;

    if (this.governorateId !== named.id) {
      this.governorateId = named.id;
      this.districtId = null;
      this.neighborhoodId = null;
    }
    this.cityFilter = '';
  }

  /** GET /api/lookups/amenities — لفلتر المرافق في لوحة البحث. */
  private loadAmenities(): void {
    this.lookupsApi
      .getAmenities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: amenities => this.amenities.set(amenities),
        error: () => this.amenities.set([])
      });
  }

  isAmenitySelected(amenityId: string): boolean {
    return this.selectedAmenityIds.includes(amenityId);
  }

  toggleAmenitiesSection(): void {
    this.amenitiesOpen = !this.amenitiesOpen;
  }

  toggleAmenityFilter(amenityId: string): void {
    this.selectedAmenityIds = this.isAmenitySelected(amenityId)
      ? this.selectedAmenityIds.filter(id => id !== amenityId)
      : [...this.selectedAmenityIds, amenityId];
  }

  /** Switches "near me" on (asks for the position once) or off (back to the plain list); the filters stay either way. */
  toggleGeoMode(): void {
    if (this.geoModeActive()) {
      this.geoModeActive.set(false);
      this.geoCoords.set(null);
      this.refreshFromFirstPage();
      return;
    }

    if (!('geolocation' in navigator)) {
      this.toast.error(this.translate.instant('PROPERTY_LIST.GEO_UNSUPPORTED'));
      return;
    }

    // توضيح سبب طلب إذن الموقع قبل ظهور نافذة المتصفح/النظام مباشرة — المستخدم لم يكن
    // يرَ أي تفسير قبل هذا التعديل، فقط أيقونة زر ثم طلب الإذن مباشرة.
    this.toast.info(this.translate.instant('PROPERTY_LIST.GEO_CONSENT_NOTE'));

    this.geoLoading.set(true);

    navigator.geolocation.getCurrentPosition(
      position => {
        this.geoCoords.set({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        this.geoModeActive.set(true);
        this.geoLoading.set(false);
        this.scrollToResultsWhenLoaded = true;
        this.setFiltersOpen(false);
        this.refreshFromFirstPage();
      },
      () => {
        this.geoLoading.set(false);
        this.toast.error(this.translate.instant('PROPERTY_LIST.GEO_DENIED'));
      },
      // A position from the last minute is good enough for "near me"; waiting forever for a fresh one is not.
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
    );
  }

  onRadiusChange(): void {
    // The position is already known: a new radius only needs a new search, not a second permission prompt.
    if (!this.geoModeActive() || !this.geoCoords()) return;
    this.refreshFromFirstPage();
  }

  /** Runs the current query again from page 1 (and puts page 1 in the URL), whether or not the URL changes. */
  private refreshFromFirstPage(): void {
    this.navigateWithCurrentState(1, true, true);
  }

  openFilters(): void {
    this.setFiltersOpen(true);
  }

  closeFilters(): void {
    this.setFiltersOpen(false);
  }

  // Keyboard users (and tablets with a hardware keyboard) had no way to dismiss the filter drawer
  // other than finding its close button; Back and the backdrop were already covered.
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.filtersOpen) {
      this.closeFilters();
    }
  }

  /** نقطة وحيدة تُزامن `filtersOpen` مع قفل تمرير الصفحة — نفس السبب الموثّق بـ NavbarComponent.setMobileMenuOpen. */
  private setFiltersOpen(open: boolean): void {
    if (this.filtersOpen === open) {
      return;
    }

    this.filtersOpen = open;

    if (open) {
      this.scrollLock.lock();
    } else {
      this.scrollLock.unlock();
    }
  }

  /** Re-fetches the current page without touching the URL: the error state's Retry button. */
  loadProperties(): void {
    this.reload$.next();
  }

  /**
   * After "apply filters" the person is looking at the filter panel (a drawer on a phone, the sidebar on a
   * desktop): once the answer is in, the top of the results - or the "nothing matches" message - is brought into
   * view and focused, so the effect of the button is never out of sight.
   */
  private revealResultsIfRequested(): void {
    if (!this.scrollToResultsWhenLoaded) return;
    this.scrollToResultsWhenLoaded = false;
    // One macrotask later: the change detection that paints the new results (or the empty message) has run by then.
    const timer = setTimeout(() => {
      const region = this.resultsRegion?.nativeElement;
      if (!region) return;
      region.scrollIntoView({ block: 'start' });
      region.focus({ preventScroll: true });
    }, 0);
    this.destroyRef.onDestroy(() => clearTimeout(timer));
  }

  private applyResult(result: PagedResult<Property>): void {
    this.properties.set(result.items);
    this.totalCount.set(result.totalCount);
    this.currentPage.set(result.page);
    this.pageSize.set(result.pageSize);
    this.loading.set(false);
  }

  get activeFiltersCount(): number {
    let count = 0;

    if (this.searchText?.trim()) count++;
    if (this.selectedListingType) count++;
    if (this.cityFilter?.trim()) count++;
    if (this.minPrice !== null && this.minPrice !== undefined) count++;
    if (this.maxPrice !== null && this.maxPrice !== undefined) count++;
    if (this.selectedAmenityIds.length > 0) count++;
    if (this.sortBy && this.sortBy !== 'CreatedAt') count++;
    if (this.governorateId) count++;
    if (this.districtId) count++;
    if (this.neighborhoodId) count++;
    if (this.districtText.trim()) count++;
    if (this.neighborhoodText.trim()) count++;
    if (this.addressText.trim()) count++;
    if (this.locationId) count++;
    if (this.propertyTypeId) count++;

    return count;
  }

  /** A price bound is set, so the currency matters (and is sent). */
  get hasPriceFilter(): boolean {
    return this.minPrice !== null && this.minPrice !== undefined || this.maxPrice !== null && this.maxPrice !== undefined;
  }

  /** Both bounds set and the lower one is above the upper: nothing can match, so do not ask. */
  get priceRangeInverted(): boolean {
    return this.minPrice !== null && this.minPrice !== undefined
      && this.maxPrice !== null && this.maxPrice !== undefined
      && this.minPrice > this.maxPrice;
  }

  /**
   * Price order compares like with like: a sale price with a sale price, a rent with a rent. Under
   * "All" there is no single price to order by (the old behaviour ordered sales by their missing
   * rent), so the option is offered only once a listing type is chosen (P7-D02).
   */
  get canSortByPrice(): boolean {
    return this.selectedListingType !== '';
  }

  selectListingType(type: '' | 'ForRent' | 'ForSale'): void {
    this.selectedListingType = type;
    if (type === '' && (this.sortBy === 'Price' || this.sortBy === 'PriceDesc')) {
      this.sortBy = 'CreatedAt';
    }
  }

  /** The approximate equivalent of a listing's price in the chosen currency, shown while a price range is active. */
  equivalentPrice(property: Property): string | null {
    if (!this.hasPriceFilter || !this.currencyCode) {
      return null;
    }

    const own = (property.currencyCode ?? '').toUpperCase();
    const amount = primaryListingPrice(property);
    if (!amount || !own || own === this.currencyCode) {
      return null;
    }

    const converted = this.currencyRates.convert(amount, own, this.currencyCode);
    return converted === null ? null : `≈ ${formatListingPrice(Math.round(converted), this.currencyCode)}`;
  }

  isReserved(property: Property): boolean {
    return isReservedListing(property);
  }

  applyFilters(): void {
    if (this.priceRangeInverted) {
      // Said here, in the reader's language, instead of sending a request the server would refuse.
      this.filterError.set('PROPERTY_LIST.PRICE_RANGE_INVERTED');
      return;
    }

    this.filterError.set('');
    this.commitPlaceDraft();
    this.setFiltersOpen(false);
    this.scrollToResultsWhenLoaded = true;
    // A new/changed search or filter always returns to page 1 — the previous
    // page from a different result set is otherwise very likely to come back
    // empty and read as a spurious "no results" error. "Near me", if on, stays on: it is a mode of the
    // search, and the filters now apply inside it.
    this.navigateWithCurrentState(1);
  }

  resetFilters(): void {
    this.searchText = '';
    this.selectedListingType = '';
    this.cityFilter = '';
    this.minPrice = null;
    this.maxPrice = null;
    this.selectedAmenityIds = [];
    this.sortBy = 'CreatedAt';
    this.currencyCode = this.defaultCurrencyCode();
    this.filterError.set('');
    this.governorateId = null;
    this.districtId = null;
    this.neighborhoodId = null;
    this.districtText = '';
    this.neighborhoodText = '';
    this.locationId = null;
    this.locationPlace.set(null);
    this.addressText = '';
    this.placeDraft = null;
    this.placeBox?.reset();
    this.propertyTypeId = null;
    this.districts.set([]);
    this.neighborhoods.set([]);
    this.geoModeActive.set(false);
    this.geoCoords.set(null);
    this.setFiltersOpen(false);
    // Clears the URL entirely (not just component state) so a refresh or a
    // shared link after Reset doesn't resurrect the filters that were just cleared. When the URL was
    // already clean (only "near me" was on) the list is reloaded instead, so Reset always refreshes.
    this.scrollToResultsWhenLoaded = true;
    this.navigateWithCurrentState(1, false, true);
  }

  /**
   * Phase-0, Task 3 — POST /savedsearch from the current filter panel state.
   * UserId is derived server-side from the JWT; an anonymous user gets a 401,
   * surfaced here as the generic SAVE_SEARCH_ERROR toast (the button is only
   * shown when logged in — see the template's *ngIf).
   */
  saveCurrentSearch(): void {
    if (this.savingSearch()) return;

    const name = (prompt(this.translate.instant('PROPERTY_LIST.SAVE_SEARCH_NAME_PROMPT')) ?? '').trim();
    this.foldGovernorateNameIntoGovernorateFilter();
    this.savingSearch.set(true);

    this.savedSearchApi
      .create({
        Name: name || null,
        City: this.cityFilter.trim() || null,
        GovernorateId: this.governorateId,
        DistrictId: this.districtId,
        NeighborhoodId: this.neighborhoodId,
        PropertyTypeId: this.propertyTypeId,
        ListingType: this.selectedListingType || null,
        MinPrice: this.minPrice,
        MaxPrice: this.maxPrice,
        // The range means nothing without the currency it was written in (the matcher compares
        // listings in other currencies by it).
        CurrencyCode: this.hasPriceFilter && this.currencyCode ? this.currencyCode : null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savingSearch.set(false);
          this.toast.success(this.translate.instant('PROPERTY_LIST.SAVE_SEARCH_SUCCESS'));
        },
        error: () => {
          this.savingSearch.set(false);
          this.toast.error(this.translate.instant('PROPERTY_LIST.SAVE_SEARCH_ERROR'));
        }
      });
  }

  get isLoggedIn(): boolean {
    return !!this.auth.getAccessToken();
  }

  goToPage(page: number): void {
    const safePage = Math.max(1, Math.min(Number(page) || 1, this.totalPages()));
    // Reuses the currently-applied filters (unchanged instance fields) and only
    // overrides the page, so pagination never loses the active search/filters.
    this.navigateWithCurrentState(safePage);
  }

  pageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    const pages: number[] = [];

    for (let page = start; page <= end; page++) {
      pages.push(page);
    }

    return pages;
  }

  nextPage(): void {
    if (this.hasNext()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  prevPage(): void {
    if (this.hasPrevious()) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  trackById(_: number, property: Property): string {
    return property.id ?? String(_);
  }

  getResponsiveImage(property: Property, width = 640): string {
    return this.urlService.buildResponsiveUrl(this.getMainImage(property), width) ?? this.fallbackImage;
  }

  getResponsiveSrcSet(property: Property): string | null {
    return this.urlService.buildResponsiveSrcSet(this.getMainImage(property), [320, 480, 640, 800]);
  }

  getMainImage(property: Property): string {
    return (
      property.mainImageUrl
      ?? property.images?.find(img => img.isMain)?.url
      ?? property.images?.[0]?.url
      ?? this.fallbackImage
    );
  }

  getPrice(property: Property): string {
    return this.getFormattedPrice(property);
  }

  getFormattedPrice(property: Property): string {
    return formatListingPrice(primaryListingPrice(property), property.currencyCode);
  }

  getLocation(property: Property): string {
    return [property.street, this.locations.city(property), property.postalCode].filter(Boolean).join(listSeparator()) || '—';
  }

  private mapSort(): Pick<PropertyFilterDto, 'sortBy' | 'sortDescending'> {
    // `Price` is the API's currency-aware order (sale price for sales, rent for rents, everything
    // compared in one currency, listings without a price last). It needs a listing type, so a
    // link that asks for price order under "All" gets the newest-first order instead of a 422.
    if (this.canSortByPrice) {
      switch (this.sortBy) {
        case 'Price':
          return { sortBy: 'Price', sortDescending: false };
        case 'PriceDesc':
          return { sortBy: 'Price', sortDescending: true };
      }
    }

    return { sortBy: 'CreatedAt', sortDescending: true };
  }
}
