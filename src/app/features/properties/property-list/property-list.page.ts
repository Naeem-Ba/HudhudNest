// =============================================================
// src/app/features/properties/property-list/property-list.page.ts
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, ParamMap, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, debounceTime, EMPTY, fromEvent, switchMap, tap } from 'rxjs';

import { PropertyApiService } from '../../../core/api/property-api.service';
import { FavoritesApiService } from '../../../core/api/favorites-api.service';
import { SavedSearchApiService } from '../../../core/api/saved-search-api.service';
import {
  LookupsApiService,
  LookupAmenity,
  LookupItem,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { LanguageService } from '../../../core/services/language.service';
import { PagedResult } from '../../../core/models/api.model';
import { Property, PropertyFilterDto } from '../../../core/models/property.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { UrlService } from '../../../core/services/url.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FavoriteToggleButtonComponent } from '../../../shared/ui/favorite-toggle-button.component';
import { StructuredDataService, BREADCRUMB_JSON_LD_ID } from '../../../core/services/structured-data.service';
import { PropertyShareUrlService } from '../../../core/sharing/property-share-url.service';

@Component({
  selector: 'app-property-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    EmptyStateComponent,
    SkeletonCardGridComponent,
    ImageFallbackDirective,
    FavoriteToggleButtonComponent
  ],
  templateUrl: './property-list.page.html',
  styleUrls: ['./property-list.page.scss']
})
export class PropertyListPage implements OnInit {
  /** يطابق $bp-tablet في _breakpoints.scss — نقطة الكسر التي يتحوّل عندها
   *  .filter-sidebar من Overlay كامل الشاشة إلى شريط جانبي ثابت (property-list.page.scss). */
  private static readonly DESKTOP_BREAKPOINT_PX = 980;

  private readonly api = inject(PropertyApiService);
  private readonly favoritesApi = inject(FavoritesApiService);
  private readonly savedSearchApi = inject(SavedSearchApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly langService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly overlayBackHandlers = inject(OverlayBackHandlerService);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly urlService = inject(UrlService);
  private readonly structuredData = inject(StructuredDataService);
  private readonly shareUrl = inject(PropertyShareUrlService);

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

  readonly favoritePropertyIds = signal<Set<string>>(new Set());

  /**
   * ✅ إضافة: اقتراحات مدن حقيقية عبر GET /api/lookups/cities لحقل فلترة
   * المدينة (كان نصياً حراً بدون أي اقتراح رغم توفر endpoint جاهز لذلك).
   */
  readonly citySuggestions = signal<LookupItem[]>([]);

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
  districtId: number | null = null;
  neighborhoodId: number | null = null;
  propertyTypeId: number | null = null;

  /** Phase-0, Task 3 — "save this search" button state. */
  readonly savingSearch = signal(false);

  // ── Geo-search ("العقارات القريبة مني") ──
  // يستخدم GET /properties/geo-search الذي كان غير مستغَل إطلاقاً في الواجهة
  // رغم أن الخادم يوفره بفهرسة PostGIS مخصصة لهذا الغرض.
  readonly geoModeActive = signal(false);
  readonly geoLoading = signal(false);
  radiusKm = 5;

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

    this.loadFavoriteIds();
    this.loadCitySuggestions();
    this.loadAmenities();
    this.loadGovernorates();
    this.loadPropertyTypeCatalog();

    // Phase 3: the URL is the single source of truth for search/filter/pagination
    // state — this subscription (not a one-time snapshot read) drives every load:
    // initial page load, a deep link (home hero search / saved search), a filter
    // panel "apply", a page change, Reset, and browser back/forward navigation all
    // funnel through here as a query-param change. switchMap cancels an in-flight
    // request if a newer one starts before it resolves (race-condition guard).
    this.route.queryParamMap
      .pipe(
        tap(params => {
          this.applyParamsToState(params);
          this.loading.set(true);
          this.error.set('');
        }),
        switchMap(() =>
          this.api.getPropertiesPaged(this.buildFilterFromState(this.currentPage())).pipe(
            catchError(() => {
              this.error.set('PROPERTY_LIST.LOAD_ERROR');
              this.loading.set(false);
              return EMPTY;
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => this.applyResult(result));
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
  onGovernorateChange(): void {
    // The free-text city is a second, unrelated way to name the same place — keeping a city
    // typed for the previous governorate would send a contradictory combination that can only
    // return nothing.
    this.cityFilter = '';
    this.districtId = null;
    this.neighborhoodId = null;
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

    this.governorateId = params.get('governorateId') ? Number(params.get('governorateId')) : null;
    this.districtId = params.get('districtId') ? Number(params.get('districtId')) : null;
    this.neighborhoodId = params.get('neighborhoodId') ? Number(params.get('neighborhoodId')) : null;
    this.propertyTypeId = params.get('propertyTypeId') ? Number(params.get('propertyTypeId')) : null;

    this.currentPage.set(params.get('page') ? Number(params.get('page')) : 1);
    this.pageSize.set(params.get('pageSize') ? Number(params.get('pageSize')) : 20);

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

  /** Builds the request DTO sent to the API from the filter panel's current UI-bound state. */
  private buildFilterFromState(page: number): PropertyFilterDto {
    const sort = this.mapSort();

    return {
      page,
      pageSize: this.pageSize(),
      searchTerm: this.searchText.trim() || undefined,
      city: this.cityFilter.trim() || undefined,
      listingType: this.selectedListingType || undefined,
      minPrice: this.minPrice ?? undefined,
      maxPrice: this.maxPrice ?? undefined,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : undefined,
      sortBy: sort.sortBy,
      sortDescending: sort.sortDescending,
      governorateId: this.governorateId ?? undefined,
      districtId: this.districtId ?? undefined,
      neighborhoodId: this.neighborhoodId ?? undefined,
      propertyTypeId: this.propertyTypeId ?? undefined
    };
  }

  /**
   * Pushes the filter panel's current UI-bound state into the URL as query
   * params (replacing, not merging — an omitted/null param is dropped rather
   * than left dangling from a previous filter). The queryParamMap subscription
   * in ngOnInit reacts to the resulting navigation and performs the actual
   * fetch, so this is the one place that turns a user action into a request.
   */
  private navigateWithCurrentState(page: number): void {
    const queryParams: Record<string, string | number | string[] | null> = {
      search: this.searchText.trim() || null,
      city: this.cityFilter.trim() || null,
      listingType: this.selectedListingType || null,
      minPrice: this.minPrice ?? null,
      maxPrice: this.maxPrice ?? null,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : null,
      sort: this.sortBy && this.sortBy !== 'CreatedAt' ? this.sortBy : null,
      governorateId: this.governorateId ?? null,
      districtId: this.districtId ?? null,
      neighborhoodId: this.neighborhoodId ?? null,
      propertyTypeId: this.propertyTypeId ?? null,
      page: page > 1 ? page : null,
      pageSize: this.pageSize() !== 20 ? this.pageSize() : null
    };

    this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  private loadCitySuggestions(): void {
    this.lookupsApi
      .getCities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: cities => this.citySuggestions.set(cities),
        error: () => this.citySuggestions.set([])
      });
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

  toggleAmenityFilter(amenityId: string): void {
    this.selectedAmenityIds = this.isAmenitySelected(amenityId)
      ? this.selectedAmenityIds.filter(id => id !== amenityId)
      : [...this.selectedAmenityIds, amenityId];
  }

  private loadFavoriteIds(): void {
    if (!this.auth.getAccessToken()) return;

    this.favoritesApi
      .getFavorites()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: favorites => {
          const ids = favorites.map(f => f.propertyId).filter(Boolean);
          this.favoritePropertyIds.set(new Set(ids));
        },
        error: () => {
          // فشل تحميل المفضلة ليس خطأً حرجاً لصفحة التصفح — يبقى الزر بحالته الافتراضية.
        }
      });
  }

  isFavorite(property: Property): boolean {
    return !!property.id && this.favoritePropertyIds().has(property.id);
  }

  /** يبدّل بين نتائج البحث النصي/الفلاتر العادية والبحث الجغرافي القريب. */
  toggleGeoMode(): void {
    if (this.geoModeActive()) {
      this.geoModeActive.set(false);
      this.loadProperties();
      return;
    }

    if (!('geolocation' in navigator)) {
      this.toast.error('المتصفح لا يدعم تحديد الموقع.');
      return;
    }

    // توضيح سبب طلب إذن الموقع قبل ظهور نافذة المتصفح/النظام مباشرة — المستخدم لم يكن
    // يرَ أي تفسير قبل هذا التعديل، فقط أيقونة زر ثم طلب الإذن مباشرة.
    this.toast.info('سنستخدم موقعك الحالي فقط لعرض العقارات القريبة منك.');

    this.geoLoading.set(true);

    navigator.geolocation.getCurrentPosition(
      position => {
        this.geoModeActive.set(true);
        this.geoLoading.set(false);
        this.searchNearby(position.coords.latitude, position.coords.longitude);
      },
      () => {
        this.geoLoading.set(false);
        this.toast.error('تعذر الوصول لموقعك الحالي. تأكد من إذن تحديد الموقع.');
      }
    );
  }

  searchNearby(latitude: number, longitude: number): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .geoSearch(latitude, longitude, this.radiusKm, {
        page: 1,
        pageSize: this.pageSize(),
        listingType: this.selectedListingType || undefined
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.properties.set(result.items);
          this.totalCount.set(result.totalCount);
          this.currentPage.set(result.page);
          this.pageSize.set(result.pageSize);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('PROPERTY_LIST.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  onRadiusChange(): void {
    // نحتاج موقعاً جديداً عند تغيير نصف القطر فقط إذا كان وضع القرب مفعّلاً بالفعل.
    if (!this.geoModeActive() || !('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(position => {
      this.searchNearby(position.coords.latitude, position.coords.longitude);
    });
  }

  openFilters(): void {
    this.setFiltersOpen(true);
  }

  closeFilters(): void {
    this.setFiltersOpen(false);
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

  /**
   * Re-fetches with the current (already-applied) filter/page state without
   * going through the URL — used by the error state's Retry button and by
   * toggleGeoMode() when switching back from geo-search results, neither of
   * which represents a new filter/page the user should be able to navigate
   * back to.
   */
  loadProperties(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .getPropertiesPaged(this.buildFilterFromState(this.currentPage()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => this.applyResult(result),
        error: () => {
          this.error.set('PROPERTY_LIST.LOAD_ERROR');
          this.loading.set(false);
        }
      });
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
    if (this.propertyTypeId) count++;

    return count;
  }

  applyFilters(): void {
    this.setFiltersOpen(false);
    // Applying filters runs the normal (URL-driven) search, so a previously active "near me"
    // result set must not stay flagged as active while it is no longer what is shown.
    this.geoModeActive.set(false);
    // A new/changed search or filter always returns to page 1 — the previous
    // page from a different result set is otherwise very likely to come back
    // empty and read as a spurious "no results" error.
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
    this.governorateId = null;
    this.districtId = null;
    this.neighborhoodId = null;
    this.propertyTypeId = null;
    this.districts.set([]);
    this.neighborhoods.set([]);
    this.geoModeActive.set(false);
    this.setFiltersOpen(false);
    // Clears the URL entirely (not just component state) so a refresh or a
    // shared link after Reset doesn't resurrect the filters that were just cleared.
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
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
        MaxPrice: this.maxPrice
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

  goToDetails(id: string | undefined): void {
    if (id) {
      this.router.navigate(['/properties', id]);
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
    const price = property.purchasePrice ?? property.warmRent ?? property.coldRent;

    if (!price) return '—';

    const currency = property.currencyCode ?? 'SYP';

    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(price);
    } catch {
      return `${price.toLocaleString('ar')} ${currency}`;
    }
  }

  getLocation(property: Property): string {
    return [property.street, property.city, property.postalCode].filter(Boolean).join('، ') || '—';
  }

  private mapSort(): Pick<PropertyFilterDto, 'sortBy' | 'sortDescending'> {
    const priceColumn = this.selectedListingType === 'ForSale' ? 'PurchasePrice' : 'ColdRent';

    switch (this.sortBy) {
      case 'Price':
        return { sortBy: priceColumn, sortDescending: false };
      case 'PriceDesc':
        return { sortBy: priceColumn, sortDescending: true };
      default:
        return { sortBy: 'CreatedAt', sortDescending: true };
    }
  }
}
