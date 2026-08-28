import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ServiceRequestService } from '../../core/api/service-request.service';
import { AuthService } from '../../core/auth/auth.service';
import { CANCELLABLE_STATUSES, ServiceRequestDto, ServiceRequestStatus, canReview } from '../../core/models/service.model';
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

  ngOnInit(): void { this.load(); }

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
