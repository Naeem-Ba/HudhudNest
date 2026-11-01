// «قيّم إقامتك»: نافذة صغيرة (1–5 نجوم + تعليق اختياري حتى 1000 حرف) تُرسل إلى
// POST /api/short-stay/reviews. الخادم هو الحَكَم على الأهلية (الحجز مكتمل وانتهى تاريخ المغادرة
// ولدى المضيف خطة فعّالة)؛ أي رفض (400) تُعرض رسالته العربية كما هي داخل النافذة.
import { ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ShortStayReviewApiService } from '../../../core/api/short-stay-review-api.service';
import { apiErrorText } from '../../../core/api/api-error-text';
import { ToastService } from '../../../shared/services/toast.service';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal.component';
import {
  BookingDto,
  SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH,
  validateShortStayReview
} from '../../../core/models/short-stay.model';

@Component({
  selector: 'app-short-stay-review-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, ConfirmModalComponent],
  template: `
    <app-confirm-modal
      [open]="!!booking"
      [title]="'SHORTSTAY.REVIEWS.DIALOG_TITLE' | translate"
      [confirmLabel]="'SHORTSTAY.REVIEWS.SUBMIT' | translate"
      [confirmDisabled]="!canSubmit()"
      [loading]="submitting()"
      (confirmed)="submit()"
      (cancelled)="close()"
    >
      <div class="srd" *ngIf="booking as b">
        <p class="srd__listing">{{ b.listingTitle }}</p>

        <div class="srd__stars" role="radiogroup" [attr.aria-label]="'REVIEW.RATING' | translate">
          <button
            *ngFor="let n of starValues"
            type="button"
            role="radio"
            class="srd__star"
            data-testid="review-star"
            [class.srd__star--on]="n <= rating()"
            [attr.aria-checked]="rating() === n"
            [attr.aria-label]="n + ' / 5'"
            (click)="rating.set(n)"
          >★</button>
        </div>

        <label class="srd__label" for="srd-comment">{{ 'SHORTSTAY.REVIEWS.COMMENT_LABEL' | translate }}</label>
        <textarea
          id="srd-comment"
          class="srd__comment"
          rows="4"
          data-testid="review-comment"
          [attr.maxlength]="maxLength"
          [placeholder]="'REVIEW.COMMENT_PLACEHOLDER' | translate"
          [value]="comment()"
          (input)="onComment($event)"
        ></textarea>
        <p class="srd__counter" [class.srd__counter--over]="commentLength() > maxLength" data-testid="review-counter">
          {{ commentLength() }} / {{ maxLength }}
        </p>

        <p class="srd__error" role="alert" data-testid="review-error" *ngIf="error()">{{ error() }}</p>
      </div>
    </app-confirm-modal>
  `,
  styles: [`
    .srd { display: flex; flex-direction: column; gap: .5rem; }
    .srd__listing { margin: 0; font-weight: 700; color: var(--text-strong); }
    .srd__stars { display: flex; gap: .25rem; direction: ltr; justify-content: center; }
    .srd__star {
      background: none; border: 0; cursor: pointer; padding: .1rem .2rem;
      font-size: 2rem; line-height: 1; color: var(--gray-300);
    }
    .srd__star--on { color: var(--warning, #f59e0b); }
    .srd__label { font-size: .8125rem; font-weight: 600; }
    .srd__comment {
      border: 1px solid var(--border); border-radius: var(--r-sm, 8px); padding: .5rem .6rem;
      font: inherit; font-size: 16px; resize: vertical;
    }
    .srd__counter { margin: 0; font-size: .75rem; color: var(--gray-500); text-align: end; }
    .srd__counter--over { color: var(--danger); }
    .srd__error { margin: 0; color: var(--danger); font-size: .875rem; }
  `]
})
export class ShortStayReviewDialogComponent {
  private readonly api = inject(ShortStayReviewApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  /** The Completed booking being reviewed; null keeps the dialog closed. */
  @Input() set booking(value: BookingDto | null) {
    if (value?.id !== this.current?.id) this.reset();
    this.current = value;
  }
  get booking(): BookingDto | null { return this.current; }

  /** Emits the booking id once the review is saved, so the list can mark it reviewed. */
  @Output() reviewed = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  readonly starValues = [1, 2, 3, 4, 5];
  readonly maxLength = SHORT_STAY_REVIEW_COMMENT_MAX_LENGTH;

  readonly rating = signal(0);
  readonly comment = signal('');
  readonly submitting = signal(false);
  readonly error = signal('');

  readonly commentLength = computed(() => this.comment().length);
  readonly canSubmit = computed(() =>
    !this.submitting() && validateShortStayReview(this.rating(), this.comment()) === null);

  private current: BookingDto | null = null;

  onComment(event: Event): void {
    this.comment.set((event.target as HTMLTextAreaElement).value);
  }

  close(): void {
    if (this.submitting()) return;
    this.closed.emit();
  }

  submit(): void {
    const booking = this.current;
    if (!booking || !this.canSubmit()) {
      const key = validateShortStayReview(this.rating(), this.comment());
      if (key) this.error.set(this.translate.instant(key));
      return;
    }

    this.submitting.set(true);
    this.error.set('');

    this.api.create({ bookingId: booking.id, rating: this.rating(), comment: this.comment() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.show(this.translate.instant('SHORTSTAY.REVIEWS.THANKS'), 'success');
          this.reviewed.emit(booking.id);
        },
        error: err => {
          this.submitting.set(false);
          this.error.set(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.REVIEWS.SUBMIT_ERROR'));
        }
      });
  }

  private reset(): void {
    this.rating.set(0);
    this.comment.set('');
    this.error.set('');
    this.submitting.set(false);
  }
}
