import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

import { ShortStayBookingApiService } from '../../../core/api/short-stay-booking-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  BOOKING_STATUS_LABELS,
  BookingDto,
  BookingStatus,
  canReviewBooking,
  confirmationDeadlineOf
} from '../../../core/models/short-stay.model';
import { apiErrorText } from '../../../core/api/api-error-text';
import { ShortStayReviewDialogComponent } from '../short-stay-review-dialog/short-stay-review-dialog.component';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../../shared/pipes/localized-number.pipe';

type Tab = 'mine' | 'host';

// حالات لا يمكن للضيف إلغاء حجزه فيها — مطابق لـBooking.Cancel بالباك اند (Domain).
const NON_CANCELLABLE: BookingStatus[] = ['Completed', 'Cancelled', 'Rejected', 'Expired', 'NoShow', 'CheckedOut'];

@Component({
  selector: 'app-short-stay-bookings-page',
  standalone: true,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,CommonModule, RouterLink, TranslateModule, ShortStayReviewDialogComponent],
  templateUrl: './short-stay-bookings.page.html',
  styleUrls: ['./short-stay-bookings.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShortStayBookingsPage implements OnInit {
  private readonly api = inject(ShortStayBookingApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tab = signal<Tab>('mine');
  readonly bookings = signal<BookingDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly processingId = signal<string | null>(null);
  /** The Completed booking whose «قيّم إقامتك» dialog is open. */
  readonly reviewing = signal<BookingDto | null>(null);

  readonly statusLabel = (status: BookingStatus) => BOOKING_STATUS_LABELS[status];

  readonly sorted = computed(() =>
    [...this.bookings()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );

  ngOnInit(): void {
    this.load();
  }

  switchTab(tab: Tab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    const source$: Observable<BookingDto[]> =
      this.tab() === 'mine' ? this.api.getMine() : this.api.getHostRequests();

    source$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: bookings => { this.bookings.set(bookings); this.loading.set(false); },
      error: () => { this.error.set('SHORTSTAY.BOOKINGS.LOAD_ERROR'); this.loading.set(false); }
    });
  }

  // ── إجراءات الضيف (tab === 'mine') ──────────────────────────────
  canCancel(booking: BookingDto): boolean {
    return this.tab() === 'mine' && !NON_CANCELLABLE.includes(booking.status);
  }

  cancel(booking: BookingDto): void {
    const confirmed = confirm(this.translate.instant('SHORTSTAY.BOOKINGS.CONFIRM_CANCEL'));
    if (confirmed) this.run(booking.id, () => this.api.cancel(booking.id));
  }

  // ── إجراءات المضيف (tab === 'host') ─────────────────────────────
  canApproveOrReject(booking: BookingDto): boolean {
    return this.tab() === 'host' && booking.status === 'Pending';
  }

  canRecordDepositPaid(booking: BookingDto): boolean {
    return this.tab() === 'host' && booking.status === 'Approved' && booking.depositAmount > 0;
  }

  canConfirm(booking: BookingDto): boolean {
    return this.tab() === 'host' &&
      (booking.status === 'DepositPaid' || (booking.status === 'Approved' && booking.depositAmount === 0));
  }

  canCheckIn(booking: BookingDto): boolean {
    return this.tab() === 'host' && booking.status === 'Confirmed';
  }

  canCheckOut(booking: BookingDto): boolean {
    return this.tab() === 'host' && booking.status === 'CheckedIn';
  }

  canComplete(booking: BookingDto): boolean {
    return this.tab() === 'host' && booking.status === 'CheckedOut';
  }

  approve(booking: BookingDto): void { this.run(booking.id, () => this.api.approve(booking.id)); }
  reject(booking: BookingDto): void { this.run(booking.id, () => this.api.reject(booking.id)); }
  recordDepositPaid(booking: BookingDto): void { this.run(booking.id, () => this.api.recordDepositPaid(booking.id)); }
  confirmBooking(booking: BookingDto): void { this.run(booking.id, () => this.api.confirm(booking.id)); }
  checkIn(booking: BookingDto): void { this.run(booking.id, () => this.api.checkIn(booking.id)); }
  checkOut(booking: BookingDto): void { this.run(booking.id, () => this.api.checkOut(booking.id)); }
  complete(booking: BookingDto): void { this.run(booking.id, () => this.api.complete(booking.id)); }

  // ── مهلة التأكيد: الطلب غير المؤكَّد ينتهي تلقائيًا بعد المهلة (3 أيام، 7 كحد أقصى) ──
  confirmationDeadline(booking: BookingDto): string | null {
    return confirmationDeadlineOf(booking);
  }

  // ── تقييم الإقامة: للضيف فقط، لحجز مكتمل لم يُقيَّم بعد ──
  canReview(booking: BookingDto): boolean {
    return this.tab() === 'mine' && canReviewBooking(booking);
  }

  openReview(booking: BookingDto): void {
    if (this.canReview(booking)) this.reviewing.set(booking);
  }

  closeReview(): void {
    this.reviewing.set(null);
  }

  onReviewed(bookingId: string): void {
    this.bookings.update(items => items.map(item => item.id === bookingId ? { ...item, reviewed: true } : item));
    this.reviewing.set(null);
  }

  trackById(_: number, item: BookingDto): string { return item.id; }

  private run(id: string, action: () => Observable<BookingDto>): void {
    this.processingId.set(id);
    action().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.bookings.update(items => items.map(item => item.id === id ? updated : item));
        this.processingId.set(null);
        this.toast.show(this.translate.instant('SHORTSTAY.BOOKINGS.ACTION_SUCCESS'), 'success');
      },
      error: err => {
        this.processingId.set(null);
        this.toast.show(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.BOOKINGS.ACTION_ERROR'), 'error');
      }
    });
  }
}
