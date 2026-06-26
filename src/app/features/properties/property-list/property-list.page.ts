// =============================================================
// src/app/features/properties/property-list/property-list.page.ts
//
// بديل عن: wohnungen/wohnungen.component.ts
//
// التحسينات:
//   ✅ PropertyApiService (camelCase) بدل WohnungenService (PascalCase)
//   ✅ Signals بدل class fields عادية
//   ✅ ChangeDetectionStrategy.OnPush
//   ✅ takeUntilDestroyed لمنع Memory Leaks
//   ✅ inject() الحديث
//   ✅ Pagination عبر PropertyFilterDto
//   ✅ TranslateModule لجميع النصوص
//   ✅ SkeletonCardGrid للتحميل
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

  // ── DI الحديث ─────────────────────────────────────────────────────────
  private readonly api      = inject(PropertyApiService);
  private readonly router   = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // ── State (Signals) ────────────────────────────────────────────────────
  readonly properties = signal<Property[]>([]);
  readonly loading    = signal(false);
  readonly error      = signal('');

  // ── Pagination ─────────────────────────────────────────────────────────
  readonly currentPage  = signal(1);
  readonly pageSize     = signal(20);
  readonly totalCount   = signal(0);
  readonly totalPages   = computed(() =>
    Math.ceil(this.totalCount() / this.pageSize()) || 1
  );
  readonly hasNext     = computed(() => this.currentPage() < this.totalPages());
  readonly hasPrevious = computed(() => this.currentPage() > 1);

  // ── Filter ─────────────────────────────────────────────────────────────
  readonly filter = signal<PropertyFilterDto>({
    page: 1,
    pageSize: 20,
    sortBy: 'CreatedAt',
    sortDescending: true
  });

  readonly fallbackImage = '/images/no-image.svg';

  ngOnInit(): void {
    this.loadProperties();
  }

  loadProperties(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .getProperties(this.filter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.properties.set(data ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('PROPERTY_LIST.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  goToDetails(id: string | undefined): void {
    if (id) {
      this.router.navigate(['/properties', id]);
    }
  }

  nextPage(): void {
    if (this.hasNext()) {
      this.currentPage.update(p => p + 1);
      this.filter.update(f => ({ ...f, page: this.currentPage() }));
      this.loadProperties();
    }
  }

  prevPage(): void {
    if (this.hasPrevious()) {
      this.currentPage.update(p => p - 1);
      this.filter.update(f => ({ ...f, page: this.currentPage() }));
      this.loadProperties();
    }
  }

  // ── Helper Methods ─────────────────────────────────────────────────────
  trackById(_: number, property: Property): string {
    return property.id ?? String(_);
  }

  getMainImage(property: Property): string {
    return (
      property.mainImageUrl
      ?? property.images?.find(img => img.isMain)?.url
      ?? property.images?.[0]?.url
      ?? this.fallbackImage
    );
  }

  getFormattedPrice(property: Property): string {
    const price =
      property.purchasePrice
      ?? property.warmRent
      ?? property.coldRent;

    if (!price) return '—';

    const currency = property.currencyCode ?? 'EUR';

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
    return [property.street, property.city, property.postalCode]
      .filter(Boolean)
      .join('، ') || '—';
  }

  // ---------------------------------------------------------------------------
  // UI bridge for redesigned property-list template
  // ---------------------------------------------------------------------------
  filtersOpen = false;

  searchText = '';
  selectedListingType: '' | 'ForRent' | 'ForSale' = '';
  cityFilter = '';
  minPrice: number | null = null;
  maxPrice: number | null = null;
  sortBy = 'CreatedAt';

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

    const self = this as any;

    if (typeof self.searchTextSignal?.set === 'function') {
      self.searchTextSignal.set(this.searchText);
    }

    if (typeof self.city?.set === 'function') {
      self.city.set(this.cityFilter);
    }

    if (typeof self.listingType?.set === 'function') {
      self.listingType.set(this.selectedListingType);
    }

    if (typeof self.minPriceSignal?.set === 'function') {
      self.minPriceSignal.set(this.minPrice);
    }

    if (typeof self.maxPriceSignal?.set === 'function') {
      self.maxPriceSignal.set(this.maxPrice);
    }

    if (typeof self.currentPage?.set === 'function') {
      self.currentPage.set(1);
    }

    if (typeof self.loadProperties === 'function') {
      self.loadProperties();
    }
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

  getPrice(property: any): string {
    const value =
      property?.purchasePrice ??
      property?.warmRent ??
      property?.coldRent ??
      property?.price ??
      0;

    const currency = property?.currencyCode ?? 'SYP';

    if (value === null || value === undefined || value === '') {
      return `0 ${currency}`;
    }

    const numeric = Number(value);

    if (Number.isNaN(numeric)) {
      return `${value} ${currency}`;
    }

    return `${numeric.toLocaleString('de-DE')} ${currency}`;
  }

  goToPage(page: number): void {
    const self = this as any;
    const safePage = Math.max(1, Number(page) || 1);

    if (typeof self.currentPage?.set === 'function') {
      self.currentPage.set(safePage);
    } else if ('page' in self) {
      self.page = safePage;
    }

    if (typeof self.loadProperties === 'function') {
      self.loadProperties();
    }
  }

  pageNumbers(): number[] {
    const total =
      typeof (this as any).totalPages === 'function'
        ? Number((this as any).totalPages())
        : 1;

    const current =
      typeof (this as any).currentPage === 'function'
        ? Number((this as any).currentPage())
        : 1;

    const pages: number[] = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);

    for (let page = start; page <= end; page++) {
      pages.push(page);
    }

    return pages;
  }
}