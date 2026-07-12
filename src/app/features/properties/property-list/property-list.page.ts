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
import { Property, PropertyFilterDto } from '../../../core/models/property.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { OverlayBackHandlerService } from '../../../core/services/overlay-back-handler.service';
import { UrlService } from '../../../core/services/url.service';

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
    ImageFallbackDirective
  ],
  templateUrl: './property-list.page.html',
  styleUrls: ['./property-list.page.scss']
})
export class PropertyListPage implements OnInit {
  private readonly api = inject(PropertyApiService);
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
  }

  openFilters(): void {
    this.filtersOpen = true;
  }

  closeFilters(): void {
    this.closeFilters();
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
