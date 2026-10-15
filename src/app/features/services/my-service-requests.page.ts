import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/api/property-api.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { AuthService } from '../../core/auth/auth.service';
import { Property } from '../../core/models/property.model';
import { ServiceCategoryAvailabilityDto } from '../../core/models/provider-onboarding.model';
import { CANCELLABLE_STATUSES, ServiceCategory, ServiceRequestDto, ServiceRequestStatus, canReview } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-my-service-requests-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './my-service-requests.page.html',
  styleUrls: ['./my-service-requests.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyServiceRequestsPage implements OnInit {
  private readonly requestsApi = inject(ServiceRequestService);
  private readonly offeringsApi = inject(ServiceOfferingService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly requests = signal<ServiceRequestDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedStatus = signal<ServiceRequestStatus | 'All'>('All');
  readonly processingId = signal<string | null>(null);
  readonly reviewingId = signal<string | null>(null);
  readonly reviewRating = signal(5);
  readonly reviewComment = signal('');

  readonly statuses: Array<ServiceRequestStatus | 'All'> =
    ['All', 'Submitted', 'UnderReview', 'Accepted', 'Scheduled', 'InProgress', 'Completed', 'Reviewed', 'Rejected', 'Cancelled'];

  readonly filteredRequests = computed(() => {
    const status = this.selectedStatus();
    return status === 'All' ? this.requests() : this.requests().filter(item => item.status === status);
  });

  // ── اكتشف الخدمات ─────────────────────────────────────────────────────
  // Categories come from what is really bookable (GET /ServiceOfferings/categories/availability),
  // not from a fixed list. Choosing one only moves the user toward a property; the request itself
  // is created on the property page, when they press submit.
  readonly availability = signal<ServiceCategoryAvailabilityDto[]>([]);
  readonly availabilityLoading = signal(false);
  readonly availabilityFailed = signal(false);
  readonly discoverCategory = signal<ServiceCategory | null>(null);
  readonly myProperties = signal<Property[] | null>(null);
  readonly propertiesLoading = signal(false);
  readonly propertiesFailed = signal(false);

  /** Own listings the property page can show (it serves published listings only). */
  readonly requestableProperties = computed(() =>
    (this.myProperties() ?? []).filter(property => property.isPublished !== false));

  ngOnInit(): void {
    this.load();
    this.loadAvailability();
  }

  loadAvailability(): void {
    this.availabilityLoading.set(true);
    this.availabilityFailed.set(false);
    this.offeringsApi.getAvailability()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => { this.availability.set(items); this.availabilityLoading.set(false); },
        error: () => { this.availabilityFailed.set(true); this.availabilityLoading.set(false); }
      });
  }

  chooseCategory(item: ServiceCategoryAvailabilityDto): void {
    if (item.offeringCount <= 0) return;
    this.discoverCategory.set(item.category);
    if (this.myProperties() === null && !this.propertiesLoading()) this.loadMyProperties();
  }

  closeDiscover(): void { this.discoverCategory.set(null); }

  loadMyProperties(): void {
    this.propertiesLoading.set(true);
    this.propertiesFailed.set(false);
    this.propertyApi.getMyProperties()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => { this.myProperties.set(items); this.propertiesLoading.set(false); },
        error: () => { this.propertiesFailed.set(true); this.propertiesLoading.set(false); }
      });
  }

  chooseProperty(property: Property): void {
    const category = this.discoverCategory();
    if (!category) return;
    void this.router.navigate(['/properties', property.id], { queryParams: { service: category } });
  }

  trackByCategory(_: number, item: ServiceCategoryAvailabilityDto): ServiceCategory { return item.category; }
  trackByPropertyId(_: number, item: Property): string { return item.id; }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.requestsApi.getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: requests => { this.requests.set(requests); this.loading.set(false); },
        error: () => { this.error.set('SERVICE_REQUESTS.LOAD_ERROR'); this.loading.set(false); }
      });
  }

  selectStatus(status: ServiceRequestStatus | 'All'): void { this.selectedStatus.set(status); }

  canCancel(request: ServiceRequestDto): boolean {
    const userId = this.auth.getCurrentUserId();
    return !!userId && request.requesterId === userId && CANCELLABLE_STATUSES.includes(request.status);
  }

  canReview(request: ServiceRequestDto): boolean {
    return canReview(request, this.auth.getCurrentUserId());
  }

  cancel(request: ServiceRequestDto): void {
    this.processingId.set(request.id);
    this.requestsApi.cancel(request.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.requests.update(items => items.map(item => item.id === updated.id ? updated : item));
          this.processingId.set(null);
          this.toast.show(this.translate.instant('SERVICE_REQUESTS.CANCEL_SUCCESS'), 'success');
        },
        error: () => {
          this.processingId.set(null);
          this.toast.show(this.translate.instant('SERVICE_REQUESTS.ACTION_ERROR'), 'error');
        }
      });
  }

  openReviewForm(request: ServiceRequestDto): void {
    this.reviewingId.set(request.id);
    this.reviewRating.set(5);
    this.reviewComment.set('');
  }

  closeReviewForm(): void { this.reviewingId.set(null); }

  submitReview(request: ServiceRequestDto): void {
    this.processingId.set(request.id);
    this.requestsApi.addReview(request.id, { rating: this.reviewRating(), comment: this.reviewComment().trim() || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.requests.update(items =>
            items.map(item => item.id === request.id ? { ...item, status: 'Reviewed' as ServiceRequestStatus } : item));
          this.processingId.set(null);
          this.reviewingId.set(null);
          this.toast.show(this.translate.instant('SERVICE_REQUESTS.REVIEW_SUCCESS'), 'success');
        },
        error: () => {
          this.processingId.set(null);
          this.toast.show(this.translate.instant('SERVICE_REQUESTS.ACTION_ERROR'), 'error');
        }
      });
  }

  trackById(_: number, item: ServiceRequestDto): string { return item.id; }
}
