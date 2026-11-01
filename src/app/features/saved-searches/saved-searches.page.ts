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
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { SavedSearchApiService } from '../../core/api/saved-search-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { CreateSavedSearchPayload, SavedSearch, SavedSearchFrequency } from '../../core/models/saved-search.model';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

@Component({
  selector: 'app-saved-searches',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
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

  // Growth engine P3: edit, pause/resume, frequency.
  readonly editingId = signal<string | null>(null);
  readonly savingId = signal<string | null>(null);
  readonly togglingId = signal<string | null>(null);
  readonly currencies = ['USD', 'EUR', 'SYP'] as const;
  draft: SavedSearchDraft = emptyDraft();

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
   * it as the same query-string shape property-list.page.ts reads from its
   * queryParamMap subscription (see applyParamsToState there) — reuses one
   * filter pipeline instead of duplicating search logic here.
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
    if ((search.minPrice != null || search.maxPrice != null) && search.currencyCode) {
      queryParams['currency'] = search.currencyCode;
    }

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
      parts.push(this.translate.instant('SAVED_SEARCHES.ROOMS_RANGE', {
        min: search.minRooms ?? '…',
        max: search.maxRooms ?? '…'
      }));
    }
    if (search.minArea != null || search.maxArea != null) {
      parts.push(`${search.minArea ?? '…'}-${search.maxArea ?? '…'} m²`);
    }
    if (search.hasBalcony) parts.push(this.translate.instant('PROPERTY.HAS_BALCONY'));
    if (search.hasElevator) parts.push(this.translate.instant('PROPERTY.HAS_ELEVATOR'));
    if (search.hasParkingSpace) parts.push(this.translate.instant('PROPERTY.HAS_PARKING'));

    return parts.length > 0 ? parts.join(' · ') : '—';
  }

  startEdit(search: SavedSearch): void {
    this.draft = {
      name: search.name ?? '',
      frequency: search.frequency,
      minPrice: search.minPrice ?? null,
      maxPrice: search.maxPrice ?? null,
      currencyCode: search.currencyCode ?? 'USD',
      minRooms: search.minRooms ?? null,
      maxRooms: search.maxRooms ?? null,
      minArea: search.minArea ?? null,
      maxArea: search.maxArea ?? null,
      hasBalcony: search.hasBalcony === true,
      hasElevator: search.hasElevator === true,
      hasParkingSpace: search.hasParkingSpace === true
    };
    this.editingId.set(search.id);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(search: SavedSearch): void {
    const d = this.draft;
    const hasPrice = d.minPrice != null || d.maxPrice != null;
    // PUT replaces every criterion, so the ones this form does not edit (location, type) are sent unchanged.
    const payload: CreateSavedSearchPayload = {
      Name: d.name.trim() || null,
      CountryCode: search.countryCode ?? null,
      City: search.city ?? null,
      Region: search.region ?? null,
      GovernorateId: search.governorateId ?? null,
      DistrictId: search.districtId ?? null,
      NeighborhoodId: search.neighborhoodId ?? null,
      PropertyTypeId: search.propertyTypeId ?? null,
      ListingType: search.listingType ?? null,
      MinPrice: d.minPrice,
      MaxPrice: d.maxPrice,
      CurrencyCode: hasPrice ? d.currencyCode : null,
      MinRooms: d.minRooms,
      MaxRooms: d.maxRooms,
      MinArea: d.minArea,
      MaxArea: d.maxArea,
      HasBalcony: d.hasBalcony || null,
      HasElevator: d.hasElevator || null,
      HasParkingSpace: d.hasParkingSpace || null,
      Frequency: d.frequency
    };

    this.savingId.set(search.id);
    this.api
      .update(search.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.searches.update(prev => prev.map(s => s.id !== search.id ? s : {
            ...s,
            name: payload.Name,
            minPrice: payload.MinPrice,
            maxPrice: payload.MaxPrice,
            currencyCode: payload.CurrencyCode,
            minRooms: payload.MinRooms,
            maxRooms: payload.MaxRooms,
            minArea: payload.MinArea,
            maxArea: payload.MaxArea,
            hasBalcony: payload.HasBalcony,
            hasElevator: payload.HasElevator,
            hasParkingSpace: payload.HasParkingSpace,
            frequency: d.frequency
          }));
          this.savingId.set(null);
          this.editingId.set(null);
          this.toast.success(this.translate.instant('SAVED_SEARCHES.SAVE_SUCCESS'));
        },
        error: () => {
          this.savingId.set(null);
          this.toast.error(this.translate.instant('SAVED_SEARCHES.SAVE_ERROR'));
        }
      });
  }

  togglePause(search: SavedSearch): void {
    const pausing = !search.isPaused;
    this.togglingId.set(search.id);
    (pausing ? this.api.pause(search.id) : this.api.resume(search.id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.searches.update(prev => prev.map(s => s.id === search.id ? { ...s, isPaused: pausing } : s));
          this.togglingId.set(null);
          this.toast.success(this.translate.instant(pausing ? 'SAVED_SEARCHES.PAUSED_OK' : 'SAVED_SEARCHES.RESUMED_OK'));
        },
        error: () => {
          this.togglingId.set(null);
          this.toast.error(this.translate.instant('SAVED_SEARCHES.SAVE_ERROR'));
        }
      });
  }

  trackById(_: number, search: SavedSearch): string {
    return search.id;
  }
}

interface SavedSearchDraft {
  name: string;
  frequency: SavedSearchFrequency;
  minPrice: number | null;
  maxPrice: number | null;
  currencyCode: string;
  minRooms: number | null;
  maxRooms: number | null;
  minArea: number | null;
  maxArea: number | null;
  hasBalcony: boolean;
  hasElevator: boolean;
  hasParkingSpace: boolean;
}

function emptyDraft(): SavedSearchDraft {
  return {
    name: '', frequency: 'Instant', minPrice: null, maxPrice: null, currencyCode: 'USD',
    minRooms: null, maxRooms: null, minArea: null, maxArea: null,
    hasBalcony: false, hasElevator: false, hasParkingSpace: false
  };
}
