import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminAgenciesService, AGENCY_VERIFICATION_REASON_MAX_LENGTH } from '../../core/api/admin-agencies.service';
import { apiErrorText } from '../../core/api/api-error-text';
import {
  AGENCY_VERIFICATION_STATUSES,
  AdminAgencySummary,
  AgencyVerificationEvent,
  AgencyVerificationStatus
} from '../../core/models/agency.model';
import { ToastService } from '../../shared/services/toast.service';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

/**
 * «توثيق المكاتب العقارية»: قائمة المكاتب بحالة التوثيق (المعلّقة أولًا)، وتغيير الحالة بسبب إلزامي، وسجل
 * التغييرات. التوثيق قرار إداري بعد تحقق حقيقي خارج المنصة؛ لا خطة ولا دفع يغيّره. Role Admin على الخادم
 * لكل نقطة؛ AdminGuard هنا للراحة فقط.
 */
@Component({
  selector: 'app-admin-agencies-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LocalizedDatePipe, CommonModule, FormsModule, RouterLink, TranslateModule,
    ConfirmModalComponent, EmptyStateComponent, LoadingSpinnerComponent
  ],
  templateUrl: './admin-agencies.page.html',
  styleUrls: ['./admin-agencies.page.scss']
})
export class AdminAgenciesPage implements OnInit {
  private readonly api = inject(AdminAgenciesService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageSize = 20;
  readonly reasonMaxLength = AGENCY_VERIFICATION_REASON_MAX_LENGTH;
  readonly statuses = AGENCY_VERIFICATION_STATUSES;

  readonly agencies = signal<AdminAgencySummary[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  readonly selected = signal<AdminAgencySummary | null>(null);
  readonly modalOpen = signal(false);
  readonly saving = signal(false);
  readonly history = signal<AgencyVerificationEvent[]>([]);
  readonly historyLoading = signal(false);

  search = '';
  statusFilter: AgencyVerificationStatus | '' = '';
  newStatus: AgencyVerificationStatus | '' = '';
  reason = '';

  private readonly search$ = new Subject<string>();
  /** Drops the answer of a request that a newer one has replaced (typing in the search box). */
  private requestSeq = 0;

  ngOnInit(): void {
    this.search$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.page.set(1); this.load(); });
    this.load();
  }

  onSearchChange(value: string): void {
    this.search$.next(value.trim());
  }

  onFilterChange(): void {
    this.page.set(1);
    this.load();
  }

  load(): void {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.failed.set(false);

    this.api.search({ search: this.search, status: this.statusFilter, page: this.page(), pageSize: this.pageSize })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          if (seq !== this.requestSeq) return;
          this.agencies.set(result.items);
          this.total.set(result.totalCount);
          this.loading.set(false);
        },
        error: () => {
          if (seq !== this.requestSeq) return;
          this.failed.set(true);
          this.loading.set(false);
        }
      });
  }

  goToPage(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.totalPages()));
    this.load();
  }

  open(agency: AdminAgencySummary): void {
    this.selected.set(agency);
    this.newStatus = '';
    this.reason = '';
    this.history.set([]);
    this.modalOpen.set(true);
    this.historyLoading.set(true);
    this.api.history(agency.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => { this.history.set(rows); this.historyLoading.set(false); },
      error: () => this.historyLoading.set(false)
    });
  }

  close(): void {
    if (this.saving()) return;
    this.modalOpen.set(false);
    this.selected.set(null);
  }

  /** The statuses the office can move to: every status except the one it already has. */
  targetStatuses(): AgencyVerificationStatus[] {
    const current = this.selected()?.verificationStatus;
    return this.statuses.filter(s => s !== current);
  }

  canSubmit(): boolean {
    return !!this.newStatus
      && this.reason.trim().length > 0
      && this.reason.length <= this.reasonMaxLength
      && !this.saving();
  }

  submit(): void {
    const agency = this.selected();
    if (!agency || !this.newStatus || !this.canSubmit()) return;

    this.saving.set(true);
    this.api.setVerification(agency.id, this.newStatus, this.reason).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('ADMIN_AGENCIES.SAVED'));
        this.saving.set(false);
        this.modalOpen.set(false);
        this.selected.set(null);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(apiErrorText(err) ?? this.translate.instant('ADMIN_AGENCIES.SAVE_ERROR'));
      }
    });
  }

  statusKey(status: AgencyVerificationStatus): string {
    return `OFFICES.VERIFICATION.${status.toUpperCase()}`;
  }

  trackById(_: number, row: { id: string }): string {
    return row.id;
  }
}
