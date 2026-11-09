import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminServiceRequestsService } from '../../core/api/admin-service-requests.service';
import { ServiceRequestService } from '../../core/api/service-request.service';
import { AdminServiceRequestDetailDto } from '../../core/models/admin-service-requests.model';
import { CANCELLABLE_STATUSES, SERVICE_OUTCOME_REASONS, ServiceOutcomeReason } from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';
import { ServiceConversationComponent } from '../../features/services/service-conversation.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

type Action = 'done' | 'notdone' | 'cancel' | 'hide' | null;

/**
 * One service request as the admin sees it: both sides' answers, the review, the full history and
 * the three things an admin may do — record an outcome the provider never gave, cancel a stuck
 * request, hide (or restore) a review. Every action asks for a note so the history explains it.
 */
@Component({
  selector: 'app-admin-service-request-detail-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, FormsModule, RouterLink, TranslateModule, LoadingSpinnerComponent, ServiceConversationComponent],
  templateUrl: './admin-service-request-detail.page.html',
  styleUrls: ['./admin-service-request-detail.page.scss']
})
export class AdminServiceRequestDetailPage implements OnInit {
  private readonly api = inject(AdminServiceRequestsService);
  private readonly requestsApi = inject(ServiceRequestService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly outcomeReasons = SERVICE_OUTCOME_REASONS;
  readonly detail = signal<AdminServiceRequestDetailDto | null>(null);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly busy = signal(false);
  readonly action = signal<Action>(null);

  adminNote = '';
  outcomeReason: ServiceOutcomeReason | '' = '';
  providerNote = '';

  /** The admin may close a request that is still open on the provider's side. */
  readonly canSetOutcome = computed(() => {
    const status = this.detail()?.request.status;
    return status === 'UnderReview' || status === 'Accepted' || status === 'Scheduled' || status === 'InProgress';
  });

  readonly canCancel = computed(() => {
    const status = this.detail()?.request.status;
    return !!status && CANCELLABLE_STATUSES.includes(status);
  });

  /** A method, not a computed: the form fields are plain ngModel properties a computed would not track. */
  canSubmit(): boolean {
    if (this.busy()) return false;
    if (this.action() === 'notdone') {
      if (!this.outcomeReason) return false;
      if (this.outcomeReason === 'Other' && !this.providerNote.trim()) return false;
    }
    return this.adminNote.trim().length > 0;
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    if (!this.id) { this.failed.set(true); this.loading.set(false); return; }
    this.loading.set(true);
    this.failed.set(false);
    this.api.get(this.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => { this.detail.set(detail); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); }
    });
  }

  open(action: Exclude<Action, null>): void {
    this.action.set(action);
    this.adminNote = '';
    this.outcomeReason = '';
    this.providerNote = '';
  }

  close(): void { this.action.set(null); }

  submit(): void {
    const detail = this.detail();
    const action = this.action();
    if (!detail || !action || !this.canSubmit()) return;

    this.busy.set(true);
    const done = (updated: AdminServiceRequestDetailDto): void => {
      this.detail.set(updated);
      this.busy.set(false);
      this.action.set(null);
      this.toast.show(this.translate.instant('ADMIN_SERVICES.SAVED'), 'success');
    };
    const fail = (): void => {
      this.busy.set(false);
      this.toast.show(this.translate.instant('SERVICE_REQUESTS.ACTION_ERROR'), 'error');
    };

    if (action === 'done' || action === 'notdone') {
      this.api.setOutcome(this.id, {
        completed: action === 'done',
        reason: action === 'notdone' ? (this.outcomeReason || null) : null,
        providerNote: action === 'notdone' ? this.providerNote : null,
        adminNote: this.adminNote
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: done, error: fail });
    } else if (action === 'cancel') {
      this.requestsApi.cancel(this.id, this.adminNote.trim())
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => { done(detail); this.load(); }, error: fail });
    } else if (action === 'hide' && detail.review) {
      this.api.setReviewVisibility(detail.review.id, true, this.adminNote)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: () => { done(detail); this.load(); }, error: fail });
    }
  }

  restoreReview(): void {
    const review = this.detail()?.review;
    if (!review || this.busy()) return;
    this.busy.set(true);
    this.api.setReviewVisibility(review.id, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.busy.set(false); this.toast.show(this.translate.instant('ADMIN_SERVICES.SAVED'), 'success'); this.load(); },
        error: () => { this.busy.set(false); this.toast.show(this.translate.instant('SERVICE_REQUESTS.ACTION_ERROR'), 'error'); }
      });
  }

  trackById(_: number, item: { id: string }): string { return item.id; }
}
