import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AdminShortStayService } from '../../core/api/admin-short-stay.service';
import { apiErrorText } from '../../core/api/api-error-text';
import { ADMIN_SHORT_STAY_REASON_MAX_LENGTH, AdminShortStayListing } from '../../core/models/short-stay.model';
import { ToastService } from '../../shared/services/toast.service';
import { ConfirmModalComponent } from '../../shared/ui/confirm-modal.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';

type ModalKind = 'takedown' | 'restore' | null;

/**
 * "إدارة الإقامات القصيرة": إدارة إعلانات الإقامة القصيرة (QA المرحلة 9، P9-D11). بحث وفلتر «الموقوفة فقط»،
 * وإيقاف إعلان بسبب إلزامي يراه المالك، واستعادته. يطابق شاشة إيقاف إعلانات البيع/الإيجار في
 * admin-user-properties. Role Admin على الخادم لكل نقطة؛ AdminGuard هنا للراحة فقط.
 */
@Component({
  selector: 'app-admin-short-stay-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule, RouterLink, TranslateModule,
    ConfirmModalComponent, EmptyStateComponent, LoadingSpinnerComponent
  ],
  templateUrl: './admin-short-stay.page.html',
  styleUrls: ['./admin-short-stay.page.scss']
})
export class AdminShortStayPage implements OnInit {
  private readonly api = inject(AdminShortStayService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pageSize = 20;
  readonly reasonMaxLength = ADMIN_SHORT_STAY_REASON_MAX_LENGTH;

  readonly listings = signal<AdminShortStayListing[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  readonly activeModal = signal<ModalKind>(null);
  readonly selected = signal<AdminShortStayListing | null>(null);
  readonly saving = signal(false);

  search = '';
  takenDownOnly = false;
  /** Take-down: required and shown to the owner. Restore: optional note for the audit log. */
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

    this.api.search({
      search: this.search,
      takenDown: this.takenDownOnly,
      page: this.page(),
      pageSize: this.pageSize
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (seq !== this.requestSeq) return;
        this.listings.set(result.items);
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

  openTakeDown(listing: AdminShortStayListing): void {
    this.selected.set(listing);
    this.reason = '';
    this.activeModal.set('takedown');
  }

  openRestore(listing: AdminShortStayListing): void {
    this.selected.set(listing);
    this.reason = '';
    this.activeModal.set('restore');
  }

  closeModal(): void {
    if (this.saving()) return;
    this.activeModal.set(null);
    this.selected.set(null);
  }

  /** The reason is required to take a listing down; the confirm button stays disabled until there is one. */
  canSubmitTakeDown(): boolean {
    return this.reason.trim().length > 0 && this.reason.length <= this.reasonMaxLength && !this.saving();
  }

  submitTakeDown(): void {
    const listing = this.selected();
    const reason = this.reason.trim();
    if (!listing || !reason || !this.canSubmitTakeDown()) return;

    this.saving.set(true);
    this.api.takeDown(listing.id, reason).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.afterAction('ADMIN_SHORT_STAY.TAKE_DOWN_SUCCESS'),
      error: err => this.afterError(err)
    });
  }

  submitRestore(): void {
    const listing = this.selected();
    if (!listing || this.saving()) return;

    this.saving.set(true);
    this.api.restore(listing.id, this.reason).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this.afterAction('ADMIN_SHORT_STAY.RESTORE_SUCCESS'),
      error: err => this.afterError(err)
    });
  }

  trackById(_: number, listing: AdminShortStayListing): string {
    return listing.id;
  }

  private afterAction(successKey: string): void {
    this.toast.success(this.translate.instant(successKey));
    this.saving.set(false);
    this.activeModal.set(null);
    this.selected.set(null);
    this.load();
  }

  private afterError(err: unknown): void {
    this.saving.set(false);
    this.toast.error(apiErrorText(err) ?? this.translate.instant('ADMIN_SHORT_STAY.ACTION_ERROR'));
  }
}
