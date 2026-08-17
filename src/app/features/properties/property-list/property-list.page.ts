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
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { PropertyApiService } from '../../../core/api/property-api.service';
import { FavoritesApiService } from '../../../core/api/favorites-api.service';
import { LookupsApiService, LookupAmenity, LookupItem } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Property, PropertyFilterDto } from '../../../core/models/property.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../../../core/services/overlay-back-handler.service';
import { UrlService } from '../../../core/services/url.service';
import { ToastService } from '../../../shared/services/toast.service';
import { FavoriteToggleButtonComponent } from '../../../shared/ui/favorite-toggle-button.component';

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
  private readonly api = inject(PropertyApiService);
  private readonly favoritesApi = inject(FavoritesApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly overlayBackHandlers = inject(OverlayBackHandlerService);
  private readonly urlService = inject(UrlService);

  readonly properties = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly totalCount = signal(0);
  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()) || 1);
  readonly hasNext = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevious = computed(() => this.currentPage() > 1);

  readonly filter = signal<PropertyFilterDto>({
    page: 1,
    pageSize: 20,
    sortBy: 'CreatedAt',
    sortDescending: true
  });

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
    this.loadProperties();
    this.loadFavoriteIds();
    this.loadCitySuggestions();
    this.loadAmenities();
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
    this.filtersOpen = true;
  }

  closeFilters(): void {
    this.filtersOpen = false;
  }

  loadProperties(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .getPropertiesPaged(this.filter())
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

  get activeFiltersCount(): number {
    let count = 0;

    if (this.searchText?.trim()) count++;
    if (this.selectedListingType) count++;
    if (this.cityFilter?.trim()) count++;
    if (this.minPrice !== null && this.minPrice !== undefined) count++;
    if (this.maxPrice !== null && this.maxPrice !== undefined) count++;
    if (this.selectedAmenityIds.length > 0) count++;
    if (this.sortBy && this.sortBy !== 'CreatedAt') count++;

    return count;
  }

  applyFilters(): void {
    this.filtersOpen = false;

    const sort = this.mapSort();
    const city = this.cityFilter.trim();

    this.currentPage.set(1);
    this.filter.set({
      page: 1,
      pageSize: this.pageSize(),
      city: city || undefined,
      listingType: this.selectedListingType || undefined,
      minPrice: this.minPrice ?? undefined,
      maxPrice: this.maxPrice ?? undefined,
      amenityIds: this.selectedAmenityIds.length > 0 ? this.selectedAmenityIds : undefined,
      sortBy: sort.sortBy,
      sortDescending: sort.sortDescending
    });

    this.loadProperties();
  }

  resetFilters(): void {
    this.searchText = '';
    this.selectedListingType = '';
    this.cityFilter = '';
    this.minPrice = null;
    this.maxPrice = null;
    this.selectedAmenityIds = [];
    this.sortBy = 'CreatedAt';
    this.applyFilters();
  }

  goToPage(page: number): void {
    const safePage = Math.max(1, Math.min(Number(page) || 1, this.totalPages()));
    this.currentPage.set(safePage);
    this.filter.update(filter => ({ ...filter, page: safePage, pageSize: this.pageSize() }));
    this.loadProperties();
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
