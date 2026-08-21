// =============================================================
// src/app/features/user-profile/user-profile.page.ts
//
// الصفحة الشخصية العامة لأي حساب: صورة + تاريخ الانضمام + عدد
// الشقق المُباعة/المؤجَّرة عبر المنصة + إعلاناته النشطة + تقييم من
// مستخدمين آخرين عبر أربعة محاور (المصداقية/الأمان/سرعة الرد/الشفافية)
// مع متوسط عام أعلى الصفحة.
//
// نمط الملف الواحد (قالب+أنماط ضمن .ts) هو نفس النمط المستخدم فعلاً
// بهذا المشروع لصفحات الميزات متوسطة الحجم (property-messages.page.ts).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AuthService } from '../../core/auth/auth.service';
import { UserProfileApiService } from '../../core/api/user-profile-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { Property } from '../../core/models/property.model';
import {
  RATING_CRITERIA,
  RatingEligibilityDto,
  UserProfileDto,
  UserRatingSummaryDto,
  starsFor
} from '../../core/models/user-profile.model';

@Component({
  selector: 'app-user-profile-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslateModule, EmptyStateComponent, ImageFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container profile-page" *ngIf="!loading(); else loadingTpl">
      <app-empty-state
        *ngIf="error()"
        icon="⚠️"
        [title]="'PUBLIC_PROFILE.LOAD_ERROR' | translate"
        [message]="error()"
      ></app-empty-state>

      <ng-container *ngIf="!error() && profile() as p">
        <!-- ── رأس الصفحة: الصورة + الاسم + تاريخ الانضمام + المتوسط العام ── -->
        <header class="profile-header">
          <img
            class="profile-header__avatar"
            [src]="p.profileImageUrl || '/images/default-avatar.svg'"
            appImageFallback="/images/default-avatar.svg"
            alt=""
          />

          <div class="profile-header__info">
            <h1 class="profile-header__name">
              {{ p.displayName }}
              <span class="profile-header__agent-badge" *ngIf="p.isAgent">{{ 'PUBLIC_PROFILE.AGENT_BADGE' | translate }}</span>
            </h1>
            <p class="profile-header__member-since">
              {{ 'PUBLIC_PROFILE.MEMBER_SINCE' | translate }} {{ p.memberSince | date:'dd/MM/yyyy' }}
            </p>
          </div>

          <div class="profile-header__overall" *ngIf="p.ratingsCount > 0; else noRatingsBadge">
            <span class="profile-header__overall-score">{{ p.averageOverall }}</span>
            <span class="profile-header__overall-max">/5</span>
            <div class="stars">
              <span *ngFor="let filled of stars(p.averageOverall)" [class.star--filled]="filled">★</span>
            </div>
            <span class="profile-header__overall-count">
              ({{ p.ratingsCount }} {{ 'PUBLIC_PROFILE.RATINGS_COUNT_SUFFIX' | translate }})
            </span>
          </div>
          <ng-template #noRatingsBadge>
            <div class="profile-header__overall profile-header__overall--empty">
              {{ 'PUBLIC_PROFILE.NOT_RATED_YET' | translate }}
            </div>
          </ng-template>

          <!-- ── زر واضح لتقييم صاحب الصفحة — يمرّر مباشرة لقسم التقييم أسفل الصفحة ── -->
          <button
            type="button"
            class="btn btn--outline profile-header__rate-cta"
            *ngIf="!isOwnProfile()"
            (click)="scrollToRateSection()"
          >
            ⭐ {{ 'PUBLIC_PROFILE.RATE_CTA' | translate }}
          </button>
        </header>

        <!-- ── نبذة تعريفية + عنوان/معلومات تواصل يكتبها صاحب الصفحة ── -->
        <div class="detail-card" *ngIf="p.bio || p.contactInfo">
          <div class="detail-card__header">
            <h2>{{ 'PUBLIC_PROFILE.ABOUT_TITLE' | translate }}</h2>
          </div>
          <p class="about-bio" *ngIf="p.bio">{{ p.bio }}</p>
          <p class="about-contact" *ngIf="p.contactInfo">
            <strong>{{ 'PUBLIC_PROFILE.CONTACT_INFO_LABEL' | translate }}:</strong>
            {{ p.contactInfo }}
          </p>
        </div>

        <!-- ── إحصائيات النشاط على المنصة ── -->
        <div class="stat-tiles">
          <div class="stat-tile">
            <span class="stat-tile__value">{{ p.soldCount }}</span>
            <span class="stat-tile__label">{{ 'PUBLIC_PROFILE.SOLD_COUNT' | translate }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__value">{{ p.rentedCount }}</span>
            <span class="stat-tile__label">{{ 'PUBLIC_PROFILE.RENTED_COUNT' | translate }}</span>
          </div>
          <div class="stat-tile">
            <span class="stat-tile__value">{{ activeListingsTotal() }}</span>
            <span class="stat-tile__label">{{ 'PUBLIC_PROFILE.ACTIVE_LISTINGS_COUNT' | translate }}</span>
          </div>
        </div>

        <!-- ── تفصيل التقييم حسب المحور ── -->
        <div class="detail-card" *ngIf="p.ratingsCount > 0">
          <div class="detail-card__header">
            <h2>{{ 'PUBLIC_PROFILE.RATING_BREAKDOWN' | translate }}</h2>
          </div>
          <div class="rating-breakdown">
            <div class="rating-breakdown__row" *ngFor="let c of criteria">
              <span class="rating-breakdown__label">{{ c.labelKey | translate }}</span>
              <div class="rating-breakdown__bar">
                <div class="rating-breakdown__bar-fill" [style.width.%]="(criterionAverage(p, c.key) / 5) * 100"></div>
              </div>
              <span class="rating-breakdown__value">{{ criterionAverage(p, c.key) }}/5</span>
            </div>
          </div>
        </div>

        <!-- ── قسم تقييم صاحب الصفحة — الآن أوضح: عنوان بارز + id يُستهدَف من زر
             "قيّم هذا المستخدم" أعلى الصفحة + حالة واضحة لكل موقف (غير مسجَّل
             دخول / غير مؤهَّل بعد / مؤهَّل ولم يُقيِّم / قيَّم من قبل ويمكنه التعديل) ── -->
        <div class="detail-card rate-card" id="rate-user" *ngIf="!isOwnProfile()">
          <div class="detail-card__header">
            <h2>⭐ {{ 'PUBLIC_PROFILE.RATE_THIS_USER' | translate }}</h2>
          </div>

          <div class="rate-card__loading" *ngIf="eligibilityLoading()">
            <span class="spinner-ring"></span>
          </div>

          <ng-container *ngIf="!eligibilityLoading()">
            <app-empty-state
              *ngIf="!isLoggedIn()"
              icon="🔒"
              [title]="'PUBLIC_PROFILE.RATE_LOGIN_REQUIRED_TITLE' | translate"
              [message]="'PUBLIC_PROFILE.RATE_LOGIN_REQUIRED_MESSAGE' | translate"
            ></app-empty-state>

            <app-empty-state
              *ngIf="isLoggedIn() && eligibility() && !eligibility()!.canRate"
              icon="🤝"
              [title]="'PUBLIC_PROFILE.RATE_NOT_ELIGIBLE_TITLE' | translate"
              [message]="'PUBLIC_PROFILE.RATE_NOT_ELIGIBLE_MESSAGE' | translate"
            ></app-empty-state>

            <form
              *ngIf="isLoggedIn() && eligibility()?.canRate"
              [formGroup]="ratingForm"
              (ngSubmit)="submitRating()"
              class="rating-form"
            >
              <p class="rating-form__edit-hint" *ngIf="isEditingRating()">
                ✏️ {{ 'PUBLIC_PROFILE.RATE_EDIT_HINT' | translate }}
              </p>

              <div class="rating-form__criterion" *ngFor="let c of criteria">
                <label>{{ c.labelKey | translate }}</label>
                <div class="star-input">
                  <button
                    type="button"
                    *ngFor="let n of [1,2,3,4,5]"
                    [class.star-input__btn--filled]="ratingForm.controls[c.key].value >= n"
                    (click)="ratingForm.controls[c.key].setValue(n)"
                  >★</button>
                </div>
              </div>

              <label class="rating-form__comment-label" for="ratingComment">{{ 'PUBLIC_PROFILE.COMMENT_LABEL' | translate }}</label>
              <textarea
                id="ratingComment"
                formControlName="comment"
                rows="3"
                [maxlength]="1000"
                [placeholder]="'PUBLIC_PROFILE.COMMENT_PLACEHOLDER' | translate"
              ></textarea>

              <button type="submit" class="btn btn--primary" [disabled]="submittingRating()">
                <span *ngIf="submittingRating()" class="spinner-ring"></span>
                {{ submittingRating() ? ('COMMON.SAVING' | translate) : (isEditingRating() ? ('PUBLIC_PROFILE.UPDATE_RATING' | translate) : ('PUBLIC_PROFILE.SUBMIT_RATING' | translate)) }}
              </button>
            </form>
          </ng-container>
        </div>

        <!-- ── قائمة التقييمات والتعليقات ── -->
        <div class="detail-card">
          <div class="detail-card__header">
            <h2>{{ 'PUBLIC_PROFILE.REVIEWS_TITLE' | translate }}</h2>
          </div>

          <app-empty-state
            *ngIf="!ratingsLoading() && ratings().length === 0"
            icon="⭐"
            [title]="'PUBLIC_PROFILE.NO_RATINGS_TITLE' | translate"
            [message]="'PUBLIC_PROFILE.NO_RATINGS_MESSAGE' | translate"
          ></app-empty-state>

          <div class="rating-list" *ngIf="ratings().length > 0">
            <div class="rating-item" *ngFor="let r of ratings()">
              <img
                class="rating-item__avatar"
                [src]="r.raterImageUrl || '/images/default-avatar.svg'"
                appImageFallback="/images/default-avatar.svg"
                alt=""
              />
              <div class="rating-item__body">
                <div class="rating-item__header">
                  <span class="rating-item__name">{{ r.raterName }}</span>
                  <div class="stars stars--sm">
                    <span *ngFor="let filled of starsFn(r.overallScore)" [class.star--filled]="filled">★</span>
                  </div>
                  <time class="rating-item__date">{{ r.createdAt | date:'dd/MM/yyyy' }}</time>
                </div>
                <p class="rating-item__comment" *ngIf="r.comment">{{ r.comment }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ── الإعلانات النشطة للمعلن ── -->
        <div class="detail-card">
          <div class="detail-card__header">
            <h2>{{ 'PUBLIC_PROFILE.ACTIVE_LISTINGS' | translate }}</h2>
          </div>

          <app-empty-state
            *ngIf="!listingsLoading() && activeListings().length === 0"
            icon="🏠"
            [title]="'PUBLIC_PROFILE.NO_LISTINGS_TITLE' | translate"
            [message]="'PUBLIC_PROFILE.NO_LISTINGS_MESSAGE' | translate"
          ></app-empty-state>

          <div class="listing-grid" *ngIf="activeListings().length > 0">
            <a
              class="listing-card"
              *ngFor="let listing of activeListings()"
              [routerLink]="['/properties', listing.id]"
            >
              <img
                class="listing-card__image"
                [src]="listing.mainImageUrl || listing.images?.[0]?.url || '/images/property-placeholder.svg'"
                appImageFallback="/images/property-placeholder.svg"
                alt=""
              />
              <div class="listing-card__body">
                <p class="listing-card__title">{{ listing.title }}</p>
                <p class="listing-card__city">{{ listing.city }}</p>
                <p class="listing-card__price">{{ listingPrice(listing) }}</p>
              </div>
            </a>
          </div>
        </div>
      </ng-container>
    </section>

    <ng-template #loadingTpl>
      <div class="container profile-page__loading">
        <div class="spinner-ring spinner-ring--lg"></div>
      </div>
    </ng-template>
  `,
  styles: [`
    .profile-page { padding: 1.5rem 0 3rem; display: flex; flex-direction: column; gap: 1.5rem; }
    .profile-page__loading { display: flex; justify-content: center; padding: 4rem 0; }

    .profile-header {
      display: flex; flex-wrap: wrap; align-items: center; gap: 1rem;
      background: var(--card-bg, #fff); border-radius: 12px; padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,.08);
    }
    .profile-header__avatar { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .profile-header__info { flex: 1 1 220px; min-width: 0; }
    .profile-header__name { margin: 0; font-size: 1.35rem; display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .profile-header__agent-badge {
      font-size: .7rem; background: #2563eb; color: #fff; padding: .15rem .5rem; border-radius: 999px; font-weight: 600;
    }
    .profile-header__member-since { margin: .25rem 0 0; color: var(--text-muted, #666); font-size: .9rem; }

    .profile-header__overall {
      display: flex; flex-direction: column; align-items: center; gap: .15rem;
      background: #fff8e1; border-radius: 10px; padding: .75rem 1.25rem; min-width: 140px;
    }
    .profile-header__overall--empty { background: var(--muted-bg, #f3f4f6); color: var(--text-muted, #666); font-size: .85rem; padding: 1rem 1.25rem; }
    .profile-header__overall-score { font-size: 1.8rem; font-weight: 700; color: #b45309; }
    .profile-header__overall-max { font-size: .95rem; color: var(--text-muted, #666); margin-inline-start: -.35rem; }
    .profile-header__overall-count { font-size: .75rem; color: var(--text-muted, #666); }
    .profile-header__rate-cta { flex: 0 0 auto; white-space: nowrap; }

    .about-bio { margin: 0 0 .5rem; white-space: pre-wrap; line-height: 1.6; }
    .about-contact { margin: 0; font-size: .9rem; color: var(--text-secondary, #333); }

    .rate-card__loading { display: flex; justify-content: center; padding: 1.5rem 0; }
    .rating-form__edit-hint { margin: 0 0 .5rem; font-size: .85rem; color: #b45309; background: #fff8e1; padding: .5rem .75rem; border-radius: 8px; }

    .stars { color: #d1d5db; font-size: 1.1rem; line-height: 1; }
    .stars--sm { font-size: .85rem; }
    .stars .star--filled { color: #f59e0b; }

    .stat-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: .75rem; }
    .stat-tile {
      background: var(--card-bg, #fff); border-radius: 10px; padding: 1rem; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; flex-direction: column; gap: .25rem;
    }
    .stat-tile__value { font-size: 1.6rem; font-weight: 700; }
    .stat-tile__label { font-size: .8rem; color: var(--text-muted, #666); }

    .detail-card { background: var(--card-bg, #fff); border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .detail-card__header h2 { margin: 0 0 1rem; font-size: 1.05rem; }

    .rating-breakdown__row { display: flex; align-items: center; gap: .75rem; margin-bottom: .6rem; }
    .rating-breakdown__label { flex: 0 0 130px; font-size: .85rem; }
    .rating-breakdown__bar { flex: 1; height: 8px; background: var(--muted-bg, #f3f4f6); border-radius: 999px; overflow: hidden; }
    .rating-breakdown__bar-fill { height: 100%; background: #f59e0b; border-radius: 999px; }
    .rating-breakdown__value { flex: 0 0 40px; text-align: end; font-size: .8rem; color: var(--text-muted, #666); }

    .rating-form { display: flex; flex-direction: column; gap: 1rem; }
    .rating-form__criterion { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .star-input { display: flex; gap: .25rem; }
    .star-input button {
      background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #d1d5db; line-height: 1; padding: 0;
    }
    .star-input__btn--filled { color: #f59e0b; }
    .rating-form textarea { width: 100%; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: .6rem; font-family: inherit; resize: vertical; }

    .rating-list { display: flex; flex-direction: column; gap: 1rem; }
    .rating-item { display: flex; gap: .75rem; }
    .rating-item__avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .rating-item__header { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .rating-item__name { font-weight: 600; font-size: .9rem; }
    .rating-item__date { font-size: .75rem; color: var(--text-muted, #666); margin-inline-start: auto; }
    .rating-item__comment { margin: .35rem 0 0; font-size: .9rem; color: var(--text-secondary, #333); }

    .listing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    .listing-card { display: block; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); text-decoration: none; color: inherit; }
    .listing-card__image { width: 100%; height: 120px; object-fit: cover; display: block; }
    .listing-card__body { padding: .6rem; }
    .listing-card__title { margin: 0; font-size: .9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .listing-card__city { margin: .15rem 0; font-size: .78rem; color: var(--text-muted, #666); }
    .listing-card__price { margin: 0; font-size: .85rem; font-weight: 600; color: #2563eb; }
  `]
})
export class UserProfilePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(UserProfileApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly criteria = RATING_CRITERIA;
  readonly starsFn = starsFor;

  private userId = '';

  readonly profile = signal<UserProfileDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly ratings = signal<UserRatingSummaryDto['ratings']>([]);
  readonly ratingsLoading = signal(false);

  readonly activeListings = signal<Property[]>([]);
  readonly activeListingsTotal = signal(0);
  readonly listingsLoading = signal(false);

  readonly submittingRating = signal(false);

  readonly ratingForm = this.fb.group({
    credibility: this.fb.control(5, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    safety: this.fb.control(5, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    responseSpeed: this.fb.control(5, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    transparency: this.fb.control(5, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    comment: this.fb.control('')
  });

  // ✅ إعادة تصميم: canRate القديمة كانت تفحص فقط "مستخدم مختلف عن نفسي"،
  // بلا أي شرط زيارة/مراسلة. الآن isOwnProfile تتحكم فقط بإظهار/إخفاء
  // قسم التقييم بالكامل (لا تُقيِّم نفسك)، بينما eligibility() (تُجلب من
  // GET .../ratings/eligibility) تتحكم بما إذا كان النموذج نفسه ظاهرًا
  // أم رسالة توضيحية بديلة.
  readonly isOwnProfile = computed(() => {
    const currentUserId = this.authService.getCurrentUserId();
    return !!currentUserId && currentUserId === this.userId;
  });

  readonly isLoggedIn = computed(() => !!this.authService.getCurrentUserId());

  readonly eligibility = signal<RatingEligibilityDto | null>(null);
  readonly eligibilityLoading = signal(false);

  readonly isEditingRating = computed(() => !!this.eligibility()?.alreadyRated);

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') ?? '';

    if (!this.userId) {
      this.error.set(this.translate.instant('PUBLIC_PROFILE.MISSING_USER_ID'));
      this.loading.set(false);
      return;
    }

    this.loadProfile();
    this.loadRatings();
    this.loadActiveListings();

    if (this.isLoggedIn() && !this.isOwnProfile()) {
      this.loadEligibility();
    }
  }

  private loadProfile(): void {
    this.loading.set(true);
    this.error.set('');

    this.api
      .getProfile(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: profile => {
          this.profile.set(profile);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(this.translate.instant('PUBLIC_PROFILE.LOAD_ERROR'));
          this.loading.set(false);
        }
      });
  }

  private loadRatings(): void {
    this.ratingsLoading.set(true);

    this.api
      .getRatings(this.userId, 1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: summary => {
          this.ratings.set(summary.ratings);
          this.ratingsLoading.set(false);
        },
        error: () => this.ratingsLoading.set(false)
      });
  }

  private loadActiveListings(): void {
    this.listingsLoading.set(true);

    // GET /api/Properties?ownerId=... — عام ومنشور فقط أصلاً (نفس نقطة قائمة
    // العقارات العادية)، لا حاجة لنقطة باك اند مخصصة للإعلانات النشطة.
    this.propertyApi
      .getPropertiesPaged({ ownerId: this.userId, page: 1, pageSize: 12 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.activeListings.set(result.items);
          this.activeListingsTotal.set(result.totalCount);
          this.listingsLoading.set(false);
        },
        error: () => this.listingsLoading.set(false)
      });
  }

  private loadEligibility(): void {
    this.eligibilityLoading.set(true);

    this.api
      .getEligibility(this.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: eligibility => {
          this.eligibility.set(eligibility);
          this.eligibilityLoading.set(false);

          // ✅ إذا سبق للمستخدم الحالي تقييم هذا الحساب، نُعبِّئ النموذج
          // بقيمه الحالية تلقائيًا كي يعدِّلها بدل البدء من صفر.
          const existing = eligibility.existingRating;
          if (existing) {
            this.ratingForm.patchValue({
              credibility: existing.credibility,
              safety: existing.safety,
              responseSpeed: existing.responseSpeed,
              transparency: existing.transparency,
              comment: existing.comment ?? ''
            });
          }
        },
        error: () => this.eligibilityLoading.set(false)
      });
  }

  scrollToRateSection(): void {
    document.getElementById('rate-user')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  submitRating(): void {
    if (this.ratingForm.invalid) {
      this.ratingForm.markAllAsTouched();
      return;
    }

    const raw = this.ratingForm.getRawValue();
    this.submittingRating.set(true);

    this.api
      .submitRating(this.userId, {
        credibility: raw.credibility,
        safety: raw.safety,
        responseSpeed: raw.responseSpeed,
        transparency: raw.transparency,
        comment: raw.comment?.trim() || null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const wasEditing = this.isEditingRating();
          this.toast.success(
            this.translate.instant(wasEditing ? 'PUBLIC_PROFILE.RATE_UPDATE_SUCCESS' : 'PUBLIC_PROFILE.RATE_SUCCESS')
          );
          this.submittingRating.set(false);
          // إعادة تحميل الملخص والتفصيل والأهلية كي يظهر التقييم الجديد/المُعدَّل ومتوسطه فوراً
          this.loadProfile();
          this.loadRatings();
          this.loadEligibility();
        },
        error: err => {
          // ✅ الباك اند يُعيد رسالة عربية واضحة داخل body.message لكل
          // DomainException (مثلاً شرط الزيارة/المراسلة) — نعرضها كما هي
          // بدل رسالة عامة، مع fallback مترجم إذا غاب الحقل لأي سبب.
          const backendMessage = err?.error?.message as string | undefined;
          this.toast.error(backendMessage || this.translate.instant('PUBLIC_PROFILE.RATE_ERROR'));
          this.submittingRating.set(false);
        }
      });
  }

  stars(score: number): boolean[] {
    return starsFor(score);
  }

  criterionAverage(profile: UserProfileDto, key: string): number {
    switch (key) {
      case 'credibility': return profile.averageCredibility;
      case 'safety': return profile.averageSafety;
      case 'responseSpeed': return profile.averageResponseSpeed;
      case 'transparency': return profile.averageTransparency;
      default: return 0;
    }
  }

  listingPrice(listing: Property): string {
    const currency = listing.currencyCode ?? '';
    const price = listing.purchasePrice ?? listing.coldRent ?? listing.warmRent;
    return price ? `${price} ${currency}`.trim() : '';
  }
}
