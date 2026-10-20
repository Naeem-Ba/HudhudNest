import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { ShortStayListingSearchFilter, ShortStayListingSummary } from '../../../core/models/short-stay.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { DateRangePickerComponent, DateRangeValue } from '../../../shared/ui/date-range-picker.component';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { uiNumberLocale } from '../../../core/i18n/ui-language';

@Component({
  selector: 'app-short-stay-list',
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
    DateRangePickerComponent
  ],
  templateUrl: './short-stay-list.page.html',
  styleUrls: ['./short-stay-list.page.scss']
})
export class ShortStayListPage implements OnInit {
  private readonly api = inject(ShortStayListingApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

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

  cityFilter = '';
  checkIn: string | null = null;
  checkOut: string | null = null;
  guests: number | null = null;
  minPrice: number | null = null;
  maxPrice: number | null = null;

  ngOnInit(): void {
    this.pageMeta.applyTranslated('SEO.SHORT_STAY', '/short-stay', this.destroyRef);
    this.loadListings();
  }

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

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadListings();
  }

  resetFilters(): void {
    this.cityFilter = '';
    this.checkIn = null;
    this.checkOut = null;
    this.guests = null;
    this.minPrice = null;
    this.maxPrice = null;
    this.applyFilters();
  }

  private currentFilter(): ShortStayListingSearchFilter {
    return {
      city: this.cityFilter.trim() || undefined,
      checkIn: this.checkIn ?? undefined,
      checkOut: this.checkOut ?? undefined,
      guests: this.guests ?? undefined,
      minPrice: this.minPrice ?? undefined,
      maxPrice: this.maxPrice ?? undefined,
      page: this.currentPage(),
      pageSize: this.pageSize()
    };
  }

  loadListings(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .search(this.currentFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.listings.set(result.items);
          this.totalCount.set(result.totalCount);
          this.currentPage.set(result.page);
          this.pageSize.set(result.pageSize);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('SHORTSTAY.LIST.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  goToPage(page: number): void {
    const safePage = Math.max(1, Math.min(Number(page) || 1, this.totalPages()));
    this.currentPage.set(safePage);
    this.loadListings();
  }

  nextPage(): void { if (this.hasNext()) this.goToPage(this.currentPage() + 1); }
  prevPage(): void { if (this.hasPrevious()) this.goToPage(this.currentPage() - 1); }

  goToDetails(id: string): void {
    this.router.navigate(['/short-stay', id]);
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
