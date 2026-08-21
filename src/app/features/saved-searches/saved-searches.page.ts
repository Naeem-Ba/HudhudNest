// Phase-0, Task 3 — mirrors my-listings.page.ts's shape (list + delete).
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { SavedSearchApiService } from '../../core/api/saved-search-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { SavedSearch } from '../../core/models/saved-search.model';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

@Component({
  selector: 'app-saved-searches',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    EmptyStateComponent,
    LoadingSpinnerComponent
  ],
  templateUrl: './saved-searches.page.html',
  styleUrls: ['./saved-searches.page.scss']
})
export class SavedSearchesPage implements OnInit {
  private readonly api = inject(SavedSearchApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly searches = signal<SavedSearch[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly deletingId = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.searches.set(data ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('SAVED_SEARCHES.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  confirmDelete(id: string): void {
    const confirmed = confirm(this.translate.instant('SAVED_SEARCHES.CONFIRM_DELETE'));
    if (confirmed) {
      this.delete(id);
    }
  }

  private delete(id: string): void {
    this.deletingId.set(id);

    this.api
      .remove(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.searches.update(prev => prev.filter(s => s.id !== id));
          this.toast.success(this.translate.instant('SAVED_SEARCHES.DELETE_SUCCESS'));
          this.deletingId.set(null);
        },
        error: () => {
          this.toast.error(this.translate.instant('SAVED_SEARCHES.DELETE_ERROR'));
          this.deletingId.set(null);
        }
      });
  }

  /**
   * Re-runs a saved search's criteria on the property-list page by encoding
   * it as the same query-string shape property-list.page.ts already reads
   * on init (see applyFiltersFromQueryParams there) — reuses one filter
   * pipeline instead of duplicating search logic here.
   */
  runSearch(search: SavedSearch): void {
    const queryParams: Record<string, string> = {};

    if (search.city) queryParams['city'] = search.city;
    if (search.governorateId) queryParams['governorateId'] = String(search.governorateId);
    if (search.districtId) queryParams['districtId'] = String(search.districtId);
    if (search.neighborhoodId) queryParams['neighborhoodId'] = String(search.neighborhoodId);
    if (search.propertyTypeId) queryParams['propertyTypeId'] = String(search.propertyTypeId);
    if (search.listingType) queryParams['listingType'] = search.listingType;
    if (search.minPrice != null) queryParams['minPrice'] = String(search.minPrice);
    if (search.maxPrice != null) queryParams['maxPrice'] = String(search.maxPrice);

    void this.router.navigate(['/properties'], { queryParams });
  }

  summary(search: SavedSearch): string {
    const parts: string[] = [];

    if (search.city) parts.push(search.city);
    if (search.minPrice != null || search.maxPrice != null) {
      const currency = search.currencyCode ?? '';
      parts.push(`${search.minPrice ?? '…'} - ${search.maxPrice ?? '…'} ${currency}`.trim());
    }
    if (search.minRooms != null || search.maxRooms != null) {
      parts.push(`${search.minRooms ?? '…'}-${search.maxRooms ?? '…'} rooms`);
    }

    return parts.length > 0 ? parts.join(' · ') : '—';
  }

  trackById(_: number, search: SavedSearch): string {
    return search.id;
  }
}
