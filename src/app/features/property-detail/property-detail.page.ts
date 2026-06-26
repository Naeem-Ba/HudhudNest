// =============================================================
// src/app/features/property-detail/property-detail.page.ts
//
// بديل عن: wohnung-detail/wohnung-detail.component.ts
//
// التحسينات:
//   ✅ PropertyApiService بدل WohnungenService
//   ✅ ReviewService مربوط (GET + POST reviews)
//   ✅ VisitService مربوط (POST visit request)
//   ✅ Signals + OnPush
//   ✅ takeUntilDestroyed لمنع Memory Leaks
//   ✅ inject() الحديث
//   ✅ TranslateService
//   ✅ RTL-aware gallery navigation
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/api/property-api.service';
import { ReviewService } from '../../core/api/review.service';
import { VisitService } from '../../core/api/visit.service';
import { AuthService } from '../../core/auth/auth.service';
import { Property } from '../../core/models/property.model';
import { REVIEW_COMMENT_MAX_LENGTH, ReviewDto, validateCreateReview } from '../../core/models/review.model';
import { CreateVisitRequest, validateCreateVisit } from '../../core/models/visit.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-property-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ImageFallbackDirective,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  templateUrl: './property-detail.page.html',
  styleUrls: ['./property-detail.page.scss']
})
export class PropertyDetailPage implements OnInit {

  // ── DI ────────────────────────────────────────────────────────────────
  private readonly propertyApi  = inject(PropertyApiService);
  private readonly reviewService = inject(ReviewService);
  private readonly visitService  = inject(VisitService);
  private readonly authService   = inject(AuthService);
  private readonly route         = inject(ActivatedRoute);
  private readonly translate     = inject(TranslateService);
  private readonly toast         = inject(ToastService);
  private readonly destroyRef    = inject(DestroyRef);
  private readonly fb            = inject(FormBuilder);

  // ── State Signals ─────────────────────────────────────────────────────
  readonly property       = signal<Property | null>(null);
  readonly reviews        = signal<ReviewDto[]>([]);
  readonly loading        = signal(true);
  readonly loadingReviews = signal(false);
  readonly error          = signal('');
  readonly currentIndex   = signal(0);
  readonly modalOpen      = signal(false);
  readonly showVisitForm  = signal(false);
  readonly showReviewForm = signal(false);
  readonly isLoggedIn     = computed(() => !!this.authService.getAccessToken());

  // ── Computed ──────────────────────────────────────────────────────────
  readonly images = computed(() =>
    this.property()?.images?.filter(img => !!img.url) ?? []
  );
  readonly hasImages = computed(() => this.images().length > 0);
  readonly currentImageUrl = computed(() =>
    this.images()[this.currentIndex()]?.url ?? '/images/no-image.svg'
  );
  readonly currentImageAlt = computed(() =>
    this.images()[this.currentIndex()]?.altText ?? this.property()?.title ?? ''
  );
  readonly isRTL = computed(() =>
    this.translate.currentLang === 'ar' || document.documentElement.dir === 'rtl'
  );
  readonly averageRating = computed(() => {
    const all = this.reviews();
    if (!all.length) return null;
    return (all.reduce((sum, r) => sum + r.rating, 0) / all.length).toFixed(1);
  });

  // ── Visit Form (Reactive) ─────────────────────────────────────────────
  readonly visitForm = this.fb.group({
    proposedAt:   ['', Validators.required],
    visitorName:  ['', [Validators.required, Validators.maxLength(150)]],
    visitorPhone: ['', [Validators.required, Validators.pattern(/^\+[0-9]{7,15}$/)]],
    visitorNote:  ['', Validators.maxLength(500)]
  });

  // ── Review Form (Reactive) ────────────────────────────────────────────
  readonly reviewForm = this.fb.group({
    rating:  [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    comment: ['', Validators.maxLength(REVIEW_COMMENT_MAX_LENGTH)]
  });

  readonly savingVisit  = signal(false);
  readonly savingReview = signal(false);

  readonly fallbackImage = '/images/no-image.svg';

  // ── Drag/Swipe state ──────────────────────────────────────────────────
  private startX = 0;
  private isDragging = false;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';

    if (!id) {
      this.error.set('PROPERTY_DETAIL.NO_ID');
      this.loading.set(false);
      return;
    }

    this.loadProperty(id);
    this.loadReviews(id);
  }

  // ── Data Loading ──────────────────────────────────────────────────────
  private loadProperty(id: string): void {
    this.loading.set(true);
    this.propertyApi
      .getProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.property.set(data);
          this.currentIndex.set(0);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('PROPERTY_DETAIL.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private loadReviews(propertyId: string): void {
    this.loadingReviews.set(true);
    this.reviewService
      .getPropertyReviews(propertyId, 1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.reviews.set(data);
          this.loadingReviews.set(false);
        },
        error: () => this.loadingReviews.set(false)
      });
  }

  // ── Gallery ───────────────────────────────────────────────────────────
  prev(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.update(i => i - 1);
    }
  }

  next(): void {
    if (this.currentIndex() < this.images().length - 1) {
      this.currentIndex.update(i => i + 1);
    }
  }

  openModal(): void {
    if (this.hasImages()) this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  onDragStart(event: MouseEvent | TouchEvent): void {
    this.isDragging = true;
    this.startX = 'touches' in event
      ? event.touches[0].clientX
      : event.pageX;
  }

  onDragEnd(event: MouseEvent | TouchEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const endX = 'changedTouches' in event
      ? event.changedTouches[0].clientX
      : (event as MouseEvent).pageX;
    const diff = endX - this.startX;
    if (diff > 60)       { this.isRTL() ? this.next() : this.prev(); }
    else if (diff < -60) { this.isRTL() ? this.prev() : this.next(); }
  }

  // ── Visit ─────────────────────────────────────────────────────────────
  submitVisit(): void {
    if (this.visitForm.invalid || !this.property()) return;

    const raw = this.visitForm.getRawValue();
    const request: CreateVisitRequest = {
      propertyId:   this.property()!.id,
      proposedAt:   new Date(raw.proposedAt!).toISOString(),
      visitorName:  raw.visitorName!.trim(),
      visitorPhone: raw.visitorPhone!.trim(),
      visitorNote:  raw.visitorNote ?? null
    };

    const validationError = validateCreateVisit(request);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.savingVisit.set(true);
    this.visitService
      .requestVisit(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toast.show(this.translate.instant('VISIT.SUCCESS'), 'success');
          this.showVisitForm.set(false);
          this.visitForm.reset();
          this.savingVisit.set(false);
        },
        error: () => {
          this.toast.show(this.translate.instant('VISIT.ERROR'), 'error');
          this.savingVisit.set(false);
        }
      });
  }

  // ── Review ────────────────────────────────────────────────────────────
  submitReview(): void {
    if (this.reviewForm.invalid || !this.property()) return;

    const raw = this.reviewForm.getRawValue();
    const request = {
      propertyId: this.property()!.id,
      rating: raw.rating!,
      comment: raw.comment?.trim() || null
    };

    const validationError = validateCreateReview(request);
    if (validationError) {
      this.toast.show(this.translate.instant(validationError), 'error');
      return;
    }

    this.savingReview.set(true);

    this.reviewService
      .addReview(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: review => {
          this.reviews.update(prev => [review, ...prev]);
          this.toast.show(this.translate.instant('REVIEW.SUCCESS'), 'success');
          this.showReviewForm.set(false);
          this.reviewForm.reset({ rating: 5 });
          this.savingReview.set(false);
        },
        error: () => {
          this.toast.show(this.translate.instant('REVIEW.ERROR'), 'error');
          this.savingReview.set(false);
        }
      });
  }

  // ── Price Helpers ─────────────────────────────────────────────────────
  formatPrice(value: number | null | undefined): string {
    if (!value) return '—';
    const p = this.property();
    const currency = p?.currencyCode ?? 'EUR';
    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency', currency, maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${value.toLocaleString('ar')} ${currency}`;
    }
  }

  safe(value: unknown, fallback = '—'): string {
    const text = value == null ? '' : String(value).trim();
    return text || fallback;
  }

  /** رانج النجوم 1-5 للعرض */
  readonly starsRange = [1, 2, 3, 4, 5];

  isRentListing(): boolean {
    const lt = this.property()?.listingType;
    return lt === 'ForRent' || lt === 'ForRentAndSale';
  }

  isSaleListing(): boolean {
    const lt = this.property()?.listingType;
    return lt === 'ForSale' || lt === 'ForRentAndSale';
  }
}