// قسم «التقييمات» في صفحة تفاصيل الإقامة القصيرة: المتوسط والعدد وقائمة التقييمات مع «عرض المزيد».
// نقطة النهاية عامة (GET /api/short-stay/listings/{id}/reviews) وتُرجع 404 لإعلان غير منشور.
import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { ShortStayReviewItem } from '../../../core/models/short-stay.model';
import { LocalizedDatePipe } from '../../../shared/pipes/localized-date.pipe';
import { LocalizedNumberPipe } from '../../../shared/pipes/localized-number.pipe';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-short-stay-reviews-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe, LocalizedNumberPipe,CommonModule, TranslateModule],
  template: `
    <section class="ssr" data-testid="reviews-section">
      <h2>{{ 'SHORTSTAY.REVIEWS.TITLE' | translate }}</h2>

      <p class="ssr__summary" *ngIf="totalCount() > 0" data-testid="reviews-summary">
        <strong>{{ average() | localNumber:'1.1-1' }}</strong>
        <span class="ssr__stars" aria-hidden="true">★</span>
        · {{ 'SHORTSTAY.REVIEWS.COUNT' | translate:{ count: totalCount() } }}
      </p>

      <p class="ssr__state" *ngIf="loading() && reviews().length === 0">{{ 'SHORTSTAY.REVIEWS.LOADING' | translate }}</p>
      <p class="ssr__state ssr__state--error" *ngIf="failed()">{{ 'SHORTSTAY.REVIEWS.LOAD_ERROR' | translate }}</p>
      <p class="ssr__state" *ngIf="!loading() && !failed() && totalCount() === 0" data-testid="reviews-empty">
        {{ 'SHORTSTAY.REVIEWS.EMPTY' | translate }}
      </p>

      <ul class="ssr__list" *ngIf="reviews().length > 0">
        <li class="ssr__item" *ngFor="let review of reviews(); trackBy: trackById" data-testid="review-item">
          <div class="ssr__head">
            <strong>{{ review.reviewerName || ('REVIEWS.ANONYMOUS' | translate) }}</strong>
            <span class="ssr__rating" [attr.aria-label]="review.rating + ' / 5'">
              <span *ngFor="let filled of starsOf(review.rating)" [class.ssr__muted]="!filled">★</span>
            </span>
          </div>
          <p class="ssr__date">{{ review.createdAt | localDate:'mediumDate' }}</p>
          <p class="ssr__comment" *ngIf="review.comment">{{ review.comment }}</p>
        </li>
      </ul>

      <button type="button" class="btn btn--outline btn--sm" data-testid="reviews-more"
        *ngIf="hasMore()" [disabled]="loading()" (click)="loadMore()">
        {{ 'SHORTSTAY.REVIEWS.LOAD_MORE' | translate }}
      </button>
    </section>
  `,
  styles: [`
    .ssr h2 { font-size: 1.0625rem; margin-bottom: .6rem; }
    .ssr__summary { margin: 0 0 .75rem; color: var(--gray-700); }
    .ssr__stars { color: var(--warning, #f59e0b); }
    .ssr__state { color: var(--gray-500); }
    .ssr__state--error { color: var(--danger); }
    .ssr__list { list-style: none; margin: 0 0 .75rem; padding: 0; display: flex; flex-direction: column; gap: .75rem; }
    .ssr__item { border: 1px solid var(--border); border-radius: var(--r-md, 10px); padding: .75rem .9rem; }
    .ssr__head { display: flex; justify-content: space-between; gap: .75rem; align-items: center; }
    .ssr__rating { color: var(--warning, #f59e0b); direction: ltr; white-space: nowrap; }
    .ssr__muted { color: var(--gray-300); }
    .ssr__date { margin: .15rem 0 0; font-size: .75rem; color: var(--gray-500); }
    .ssr__comment { margin: .4rem 0 0; white-space: pre-line; overflow-wrap: anywhere; }
  `]
})
export class ShortStayReviewsSectionComponent implements OnInit {
  private readonly api = inject(ShortStayListingApiService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) listingId!: string;

  readonly reviews = signal<ShortStayReviewItem[]>([]);
  readonly average = signal(0);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly failed = signal(false);
  /** True once a page came back empty, so a total that outruns the list never offers a dead button. */
  private readonly exhausted = signal(false);
  private page = 0;

  readonly hasMore = computed(() => !this.exhausted() && this.reviews().length < this.totalCount());

  ngOnInit(): void {
    this.loadMore();
  }

  loadMore(): void {
    if (this.loading()) return;

    const next = this.page + 1;
    this.loading.set(true);
    this.failed.set(false);

    this.api.getReviews(this.listingId, next, PAGE_SIZE).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: summary => {
        this.page = next;
        this.average.set(summary.averageRating);
        this.totalCount.set(summary.totalCount);
        this.reviews.update(items => [...items, ...summary.reviews]);
        this.exhausted.set(summary.reviews.length === 0);
        this.loading.set(false);
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      }
    });
  }

  starsOf(rating: number): boolean[] {
    return [1, 2, 3, 4, 5].map(n => n <= rating);
  }

  trackById(_: number, review: ShortStayReviewItem): string {
    return review.id;
  }
}
