// src/app/features/agency-public/agency-public.page.ts
//
// الصفحة العامة للمكتب العقاري بالرابط /offices/{slug} (والقديم /agencies/{slug} يحوّل إليه) (/F-AGY-05/): الشعار،
// الوصف، بيانات التواصل، الفريق، وإعلانات المكتب المنشورة (GET /api/Properties?agencyId=…
// — فلتر عرض عام، PropertyFilterDto.AgencyId بالباك اند).
//
// رقم الترخيص لا يُعرض هنا عمدًا: AgencyDto.LicenseNumber يقول صراحةً إنه لم يُتحقق منه
// أبدًا، وعرضه على صفحة عامة يقرأه الزائر كاعتماد رسمي.
//
// الفروع (P2): قائمة بالمحافظة/المنطقة والعنوان والهاتف، وخريطة صغيرة لما له إحداثيات فقط (لا موقع افتراضي).
//
// نفس نمط الملف الواحد المستخدم في user-profile.page.ts.
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { catchError, forkJoin, of, switchMap, tap } from 'rxjs';

import { AgenciesApiService } from '../../core/api/agencies-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import {
  AGENCY_RATING_COMMENT_MAX_LENGTH,
  AGENCY_RATING_CRITERIA,
  Agency,
  AgencyBranch,
  AgencyEventSource,
  AgencyProfileEvent,
  AgencyRatingDto,
  OFFICE_VISIT_SOURCE_STATE,
  AgencyRatingEligibilityDto,
  AgencyRatingSummaryDto
} from '../../core/models/agency.model';
import { starsFor } from '../../core/models/user-profile.model';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { Property } from '../../core/models/property.model';
import { PageMetaService } from '../../core/services/page-meta.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { isReservedListing, listingLifecycle, listingStatusTagKey } from '../../shared/utils/listing-status';
import { ListingViewCountComponent } from '../../shared/ui/listing-view-count.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';
import { OfficeMapPoint, OfficesMapComponent } from '../../shared/ui/offices-map.component';
import { PropertyShareUrlService } from '../../core/sharing/property-share-url.service';
import { LookupsApiService, StructuredLocationLookup, pickLocalizedName } from '../../core/api/lookups-api.service';
import { LanguageService } from '../../core/services/language.service';

const LISTINGS_PAGE_SIZE = 12;

/** Where this visit came from, from the navigation state set by /o/{code}, the directory or a listing. */
function visitSource(): Exclude<AgencyEventSource, 'None'> {
  const state = typeof history !== 'undefined' ? (history.state as Record<string, unknown> | null) : null;
  const value = state?.[OFFICE_VISIT_SOURCE_STATE];
  return value === 'Qr' || value === 'Directory' || value === 'Listing' ? value : 'Direct';
}

type AgencyListingsTab = 'active' | 'sold' | 'rented';

/** تعليق اختياري — لكن إن كُتب فلا يكون مسافات فقط. */
function notBlankIfPresent(control: AbstractControl): ValidationErrors | null {
  const value = (control.value ?? '') as string;
  return value.length > 0 && value.trim().length === 0 ? { blank: true } : null;
}

@Component({
  selector: 'app-agency-public-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,ListingViewCountComponent, CommonModule, ReactiveFormsModule, RouterLink, TranslateModule, EmptyStateComponent, ImageFallbackDirective, OfficesMapComponent],
  template: `
    <section class="container agency-page" *ngIf="!loading(); else loadingTpl">
      <app-empty-state
        *ngIf="notFound()"
        icon="🏢"
        [title]="'AGENCY_PUBLIC.NOT_FOUND' | translate"
        [message]="'AGENCY_PUBLIC.NOT_FOUND_DESC' | translate"
      ></app-empty-state>

      <ng-container *ngIf="agency() as a">
        <header class="agency-header">
          <img *ngIf="a.logoUrl; else noLogo" class="agency-header__logo" [src]="a.logoUrl" [alt]="a.name" />
          <ng-template #noLogo><div class="agency-header__logo agency-header__logo--empty" aria-hidden="true">🏢</div></ng-template>
          <div class="agency-header__info">
            <h1><bdi>{{ a.name }}</bdi></h1>
            <span class="verified-badge" *ngIf="a.verificationStatus === 'Verified'" data-testid="verified-badge"
                  [attr.title]="'AGENCY_PUBLIC.VERIFIED_HINT' | translate">
              ✓ {{ 'OFFICES.VERIFICATION.VERIFIED' | translate }}
            </span>
            <p class="agency-header__meta" *ngIf="a.city">📍 {{ a.city }}</p>
            <p class="agency-header__meta" *ngIf="a.activeListingCount != null" data-testid="active-listing-count">
              {{ 'OFFICES.ACTIVE_LISTINGS' | translate: { count: a.activeListingCount } }}
            </p>
            <p class="agency-header__meta">
              {{ 'AGENCY_PUBLIC.MEMBERS_COUNT' | translate: { count: a.memberCount } }}
            </p>
          </div>

          <div class="agency-header__overall" *ngIf="summary() && summary()!.totalCount > 0; else noRatings">
            <span class="agency-header__overall-score">{{ summary()!.averageOverall }}</span>
            <span class="agency-header__overall-max">/5</span>
            <div class="stars">
              <span *ngFor="let filled of starsFn(summary()!.averageOverall)" [class.star--filled]="filled">★</span>
            </div>
            <span class="agency-header__overall-count">
              ({{ summary()!.totalCount }} {{ 'AGENCY_RATING.RATINGS_COUNT_SUFFIX' | translate }})
            </span>
          </div>
          <ng-template #noRatings>
            <div class="agency-header__overall agency-header__overall--empty">
              {{ 'AGENCY_RATING.NOT_RATED_YET' | translate }}
            </div>
          </ng-template>

          <button type="button" class="btn btn--outline agency-header__rate-cta" *ngIf="showRateCta()" (click)="scrollToRate()">
            ⭐ {{ 'AGENCY_RATING.RATE_CTA' | translate }}
          </button>
          <button type="button" class="btn btn--ghost agency-header__share" (click)="share(a)" data-testid="share-office">
            🔗 {{ 'OFFICE_STATS.SHARE' | translate }}
          </button>
        </header>

        <p class="agency-description" *ngIf="a.description">{{ a.description }}</p>

        <div class="agency-contact" *ngIf="a.contactPhone || a.contactEmail">
          <a *ngIf="a.contactPhone" class="btn btn--outline btn--sm" [href]="'tel:' + a.contactPhone" dir="ltr"
             (click)="track({ type: 'ContactClick', channel: 'Phone' })" data-testid="contact-phone">📞 {{ a.contactPhone }}</a>
          <a *ngIf="a.contactEmail" class="btn btn--outline btn--sm" [href]="'mailto:' + a.contactEmail"
             (click)="track({ type: 'ContactClick', channel: 'Email' })" data-testid="contact-email">✉️ {{ a.contactEmail }}</a>
        </div>

        <!-- ── الفروع: القائمة دائمًا، والخريطة لما له إحداثيات فقط ── -->
        <section class="branches" *ngIf="branches().length > 0" data-testid="office-branches">
          <h2 class="section-title">{{ 'OFFICE_BRANCHES.TITLE' | translate: { count: branches().length } }}</h2>
          <app-offices-map *ngIf="branchPoints().length > 0" height="280px" [fitToPoints]="true"
                           [ariaLabel]="'OFFICE_BRANCHES.MAP_LABEL' | translate" [points]="branchPoints()"></app-offices-map>
          <ul class="branches__list">
            <li class="branches__item" *ngFor="let b of branches()" data-testid="office-branch">
              <div class="branches__name">
                <bdi>{{ b.name }}</bdi>
                <span class="branches__main" *ngIf="b.isMain">{{ 'OFFICE_BRANCHES.MAIN' | translate }}</span>
              </div>
              <p class="branches__place" *ngIf="branchPlace(b) as place">📍 {{ place }}</p>
              <p class="branches__address" *ngIf="b.address"><bdi>{{ b.address }}</bdi></p>
              <div class="branches__actions">
                <a *ngIf="b.contactPhone" class="btn btn--outline btn--sm" [href]="'tel:' + b.contactPhone" dir="ltr"
                   (click)="track({ type: 'ContactClick', channel: 'Phone' })">📞 {{ b.contactPhone }}</a>
                <a *ngIf="directionsUrl(b) as url" class="btn btn--outline btn--sm" [href]="url" target="_blank" rel="noopener noreferrer">
                  🧭 {{ 'OFFICE_BRANCHES.DIRECTIONS' | translate }}
                </a>
              </div>
            </li>
          </ul>
        </section>

        <!-- ── تفصيل تقييم المكتب حسب المحور ── -->
        <div class="detail-card" *ngIf="summary() && summary()!.totalCount > 0">
          <div class="detail-card__header"><h2>{{ 'AGENCY_RATING.BREAKDOWN' | translate }}</h2></div>
          <div class="rating-breakdown">
            <div class="rating-breakdown__row" *ngFor="let c of criteria">
              <span class="rating-breakdown__label">{{ c.labelKey | translate }}</span>
              <div class="rating-breakdown__bar">
                <div class="rating-breakdown__bar-fill" [style.width.%]="(criterionAverage(c.key) / 5) * 100"></div>
              </div>
              <span class="rating-breakdown__value">{{ criterionAverage(c.key) }}/5</span>
            </div>
          </div>
        </div>

        <!-- ── قسم تقييم المكتب. لا يظهر لمالك المكتب ولا لأعضائه (يقرّر الخادم). ── -->
        <div class="detail-card rate-card" id="rate-agency" *ngIf="!isMemberOrOwner()">
          <div class="detail-card__header"><h2>⭐ {{ 'AGENCY_RATING.RATE_THIS_AGENCY' | translate }}</h2></div>
          <p class="rate-card__separate-note">{{ 'AGENCY_RATING.SEPARATE_NOTE' | translate }}</p>

          <div class="rate-card__loading" *ngIf="eligibilityLoading()"><span class="spinner-ring"></span></div>

          <ng-container *ngIf="!eligibilityLoading()">
            <app-empty-state
              *ngIf="!isLoggedIn()"
              icon="🔒"
              [title]="'AGENCY_RATING.LOGIN_REQUIRED_TITLE' | translate"
              [message]="'AGENCY_RATING.LOGIN_REQUIRED_MESSAGE' | translate"
            ></app-empty-state>
            <a *ngIf="!isLoggedIn()" class="btn btn--primary rate-card__login" routerLink="/login">
              {{ 'AGENCY_RATING.LOGIN_CTA' | translate }}
            </a>

            <app-empty-state
              *ngIf="isLoggedIn() && eligibility() && !eligibility()!.canRate"
              icon="🤝"
              [title]="'AGENCY_RATING.NOT_ELIGIBLE_TITLE' | translate"
              [message]="'AGENCY_RATING.NOT_ELIGIBLE_MESSAGE' | translate"
            ></app-empty-state>

            <form *ngIf="isLoggedIn() && eligibility()?.canRate" [formGroup]="ratingForm" (ngSubmit)="submitRating()" class="rating-form">
              <p class="rating-form__question">{{ 'AGENCY_RATING.QUESTION' | translate }}</p>
              <p class="rating-form__edit-hint" *ngIf="isEditingRating()">✏️ {{ 'AGENCY_RATING.EDIT_HINT' | translate }}</p>

              <div
                class="rating-form__criterion"
                *ngFor="let c of criteria"
                [class.rating-form__criterion--missing]="ratingForm.controls[c.key].invalid && ratingForm.controls[c.key].touched"
              >
                <div class="rating-form__criterion-text">
                  <span class="rating-form__criterion-label" [id]="'agency-crit-' + c.key">{{ c.labelKey | translate }}</span>
                  <span class="rating-form__criterion-hint">{{ c.hintKey | translate }}</span>
                </div>
                <div class="star-input" role="radiogroup" [attr.aria-labelledby]="'agency-crit-' + c.key">
                  <button
                    type="button"
                    role="radio"
                    *ngFor="let n of [1, 2, 3, 4, 5]"
                    [attr.aria-checked]="ratingForm.controls[c.key].value === n"
                    [attr.aria-label]="n + ' / 5'"
                    [class.star-input__btn--filled]="ratingForm.controls[c.key].value >= n"
                    (click)="setCriterion(c.key, n)"
                  >★</button>
                </div>
              </div>

              <p class="rating-form__error" *ngIf="showMissingCriteria()" role="alert">
                {{ 'AGENCY_RATING.ALL_CRITERIA_REQUIRED' | translate }}
              </p>

              <label class="rating-form__comment-label" for="agencyRatingComment">{{ 'AGENCY_RATING.COMMENT_LABEL' | translate }}</label>
              <textarea
                id="agencyRatingComment"
                formControlName="comment"
                rows="3"
                [maxlength]="commentMaxLength"
                [placeholder]="'AGENCY_RATING.COMMENT_PLACEHOLDER' | translate"
              ></textarea>
              <span class="rating-form__counter">{{ ratingForm.controls.comment.value.length }}/{{ commentMaxLength }}</span>

              <button type="submit" class="btn btn--primary" [disabled]="submittingRating()">
                <span *ngIf="submittingRating()" class="spinner-ring"></span>
                {{ submittingRating() ? ('COMMON.SAVING' | translate) : (isEditingRating() ? ('AGENCY_RATING.UPDATE' | translate) : ('AGENCY_RATING.SUBMIT' | translate)) }}
              </button>
            </form>
          </ng-container>
        </div>

        <!-- ── آراء العملاء بالمكتب ── -->
        <div class="detail-card">
          <div class="detail-card__header"><h2>{{ 'AGENCY_RATING.REVIEWS_TITLE' | translate }}</h2></div>

          <app-empty-state
            *ngIf="!ratingsLoading() && ratings().length === 0"
            icon="⭐"
            [title]="'AGENCY_RATING.NO_RATINGS_TITLE' | translate"
            [message]="'AGENCY_RATING.NO_RATINGS_MESSAGE' | translate"
          ></app-empty-state>

          <div class="rating-list" *ngIf="ratings().length > 0">
            <div class="rating-item" *ngFor="let r of ratings()">
              <img class="rating-item__avatar" [src]="r.raterImageUrl || '/images/default-avatar.svg'" appImageFallback="/images/default-avatar.svg" alt="" />
              <div class="rating-item__body">
                <div class="rating-item__header">
                  <span class="rating-item__name">{{ r.raterName }}</span>
                  <div class="stars stars--sm">
                    <span *ngFor="let filled of starsFn(r.overallScore)" [class.star--filled]="filled">★</span>
                  </div>
                  <time class="rating-item__date">{{ r.createdAt | localDate: 'dd/MM/yyyy' }}</time>
                </div>
                <p class="rating-item__comment" *ngIf="r.comment">{{ r.comment }}</p>
              </div>
            </div>
          </div>
        </div>

        <h2 class="section-title">{{ 'AGENCY_PUBLIC.TEAM' | translate }}</h2>
        <ul class="team">
          <li *ngFor="let m of a.members">
            <a class="team__member" [routerLink]="['/users', m.userId]">
              <img [src]="m.profileImageUrl || '/images/default-avatar.svg'" appImageFallback="/images/default-avatar.svg" alt="" />
              <span>{{ m.displayName }}</span>
            </a>
          </li>
        </ul>

        <div class="section-head">
          <h2 class="section-title">{{ 'AGENCY_PUBLIC.LISTINGS' | translate }}</h2>
          <a class="btn btn--outline btn--sm" data-testid="browse-office-listings"
             [routerLink]="['/properties']" [queryParams]="{ agencyId: a.id, office: a.slug }">
            {{ 'AGENCY_PUBLIC.BROWSE_WITH_FILTERS' | translate }}
          </a>
        </div>

        <!-- التبويبات: المتاحة دائمًا، والمباعة/المؤجرة لا تظهر إلا إن وُجدت صفقات منها (سجل توثيق، لا تظهر في البحث). -->
        <div class="listing-tabs" role="tablist" *ngIf="soldCount() > 0 || rentedCount() > 0">
          <button type="button" role="tab" class="listing-tabs__tab" data-testid="tab-active"
            [class.listing-tabs__tab--active]="activeTab() === 'active'" [attr.aria-selected]="activeTab() === 'active'"
            (click)="selectTab('active')">{{ 'AGENCY_PUBLIC.TAB_ACTIVE' | translate }}</button>
          <button type="button" role="tab" class="listing-tabs__tab" data-testid="tab-sold" *ngIf="soldCount() > 0"
            [class.listing-tabs__tab--active]="activeTab() === 'sold'" [attr.aria-selected]="activeTab() === 'sold'"
            (click)="selectTab('sold')">{{ 'AGENCY_PUBLIC.TAB_SOLD' | translate }} ({{ soldCount() }})</button>
          <button type="button" role="tab" class="listing-tabs__tab" data-testid="tab-rented" *ngIf="rentedCount() > 0"
            [class.listing-tabs__tab--active]="activeTab() === 'rented'" [attr.aria-selected]="activeTab() === 'rented'"
            (click)="selectTab('rented')">{{ 'AGENCY_PUBLIC.TAB_RENTED' | translate }} ({{ rentedCount() }})</button>
        </div>
        <p class="muted" *ngIf="activeTab() !== 'active'">{{ 'AGENCY_PUBLIC.CLOSED_NOTE' | translate }}</p>

        <p class="muted" *ngIf="listingsLoading()">{{ 'COMMON.LOADING' | translate }}</p>
        <p class="muted" *ngIf="!listingsLoading() && listings().length === 0">{{ emptyListingsKey() | translate }}</p>
        <div class="listing-grid" *ngIf="listings().length > 0">
          <a class="listing-card" *ngFor="let listing of listings()" [routerLink]="['/properties', listing.id]"
            (click)="track({ type: 'ListingClick' })"
            [class.listing-muted]="isMuted(listing)" [class.listing-muted--closed]="activeTab() !== 'active'">
            <div class="listing-card__media">
              <img
                class="listing-card__image listing-muted__media"
                [src]="listing.mainImageUrl || listing.images?.[0]?.url || '/images/no-image.svg'"
                appImageFallback="/images/no-image.svg"
                alt=""
              />
              <span class="badge listing-card__tag" *ngIf="tagKey(listing) as tag" [ngClass]="tagClass(listing)" data-testid="status-tag">
                {{ tag | translate }}
              </span>
            </div>
            <div class="listing-card__body listing-muted__text">
              <p class="listing-card__title">{{ listing.title }}</p>
              <p class="listing-card__city">{{ listing.city }}</p>
              <p class="listing-card__price">{{ listingPrice(listing) }}</p>
              <app-listing-view-count class="card-views" [compact]="true" [count]="listing.viewCount"></app-listing-view-count>
            </div>
          </a>
        </div>
        <button *ngIf="hasMore()" type="button" class="btn btn--outline btn--sm more-link"
          [disabled]="listingsLoading()" (click)="loadMore()">
          {{ 'AGENCY_PUBLIC.LOAD_MORE' | translate }}
        </button>
      </ng-container>
    </section>

    <ng-template #loadingTpl>
      <section class="container agency-page"><p class="muted">{{ 'COMMON.LOADING' | translate }}</p></section>
    </ng-template>
  `,
  styles: [`
    .agency-page { padding-block: 2rem; max-width: 960px; }
    .agency-header { display: flex; align-items: center; gap: 1.25rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .agency-header__logo { width: 96px; height: 96px; border-radius: var(--r-lg); border: 1px solid var(--border); object-fit: contain; background: var(--surface); }
    .agency-header__logo--empty { display: flex; align-items: center; justify-content: center; font-size: 2.5rem; }
    .agency-header__info { min-width: 0; }
    .agency-header h1 { margin: 0 0 .25rem; font-size: clamp(1.3rem, 2.5vw, 1.75rem); font-weight: 800; color: var(--gray-900); overflow-wrap: anywhere; }
    .agency-header__meta { margin: 0; font-size: .85rem; color: var(--gray-500); }
    .agency-description { white-space: pre-line; line-height: 1.8; color: var(--gray-700); margin: 0 0 1rem; }
    .branches app-offices-map { margin-bottom: .75rem; }
    .branches__list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: .75rem; }
    .branches__item { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); padding: .85rem; display: flex; flex-direction: column; gap: .35rem; min-width: 0; }
    .branches__name { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; font-weight: 700; color: var(--gray-900); overflow-wrap: anywhere; }
    .branches__main { padding: .05rem .5rem; border-radius: 999px; background: var(--primary-soft); color: var(--primary-text); font-size: .72rem; font-weight: 700; }
    .branches__place, .branches__address { margin: 0; font-size: .85rem; color: var(--gray-700); overflow-wrap: anywhere; }
    .branches__actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .25rem; }
    .agency-contact { display: flex; gap: .6rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; margin: 1.5rem 0 .75rem; }
    .section-head .section-title { margin: 0; }
    .verified-badge { display: inline-flex; align-items: center; gap: .25rem; margin-bottom: .3rem; padding: .15rem .6rem; border-radius: 999px; background: var(--success-soft); color: var(--success-text); font-size: .78rem; font-weight: 700; }
    .section-title { font-size: 1.05rem; font-weight: 700; color: var(--gray-900); margin: 1.5rem 0 .75rem; }
    .team { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: .75rem; }
    .team__member { display: flex; align-items: center; gap: .5rem; padding: .4rem .8rem .4rem .4rem; border: 1px solid var(--border); border-radius: 999px; text-decoration: none; color: var(--gray-800); background: var(--surface); }
    .team__member img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
    .muted { color: var(--gray-500); }
    .listing-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; }
    .listing-card { display: block; border-radius: 10px; overflow: hidden; box-shadow: var(--shadow-xs); border: 1px solid var(--border); text-decoration: none; color: inherit; background: var(--surface); }
    .listing-card__image { width: 100%; height: 120px; object-fit: cover; display: block; }
    .listing-card__body { padding: .6rem; }
    .listing-card__title { margin: 0; font-size: .9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--gray-800); }
    .listing-card__city { margin: .15rem 0; font-size: .78rem; color: var(--gray-500); }
    .listing-card__price { margin: 0; font-size: .85rem; font-weight: 600; color: var(--primary-text); }
    .more-link { margin-top: 1rem; }
    .listing-tabs { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: .75rem; }
    .listing-tabs__tab { padding: .4rem .9rem; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--gray-700); font: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; }
    .listing-tabs__tab--active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary-text); }
    .listing-card__media { position: relative; }
    .listing-card__tag { position: absolute; inset-block-start: .5rem; inset-inline-start: .5rem; }

    /* ── تقييم المكتب (منفصل عن تقييم الأعضاء) ── */
    .detail-card { background: var(--surface); border-radius: 12px; padding: 1.25rem; box-shadow: var(--shadow-xs); border: 1px solid var(--border); margin-top: 1.25rem; }
    .detail-card__header h2 { margin: 0 0 1rem; font-size: 1.05rem; color: var(--gray-800); }
    .agency-header__overall { display: flex; flex-direction: column; align-items: center; gap: .15rem; background: var(--warning-soft); border-radius: 10px; padding: .75rem 1.25rem; min-width: 140px; margin-inline-start: auto; }
    .agency-header__overall--empty { background: var(--gray-100); color: var(--gray-500); font-size: .85rem; padding: 1rem 1.25rem; }
    .agency-header__overall-score { font-size: 1.8rem; font-weight: 700; color: var(--warning-text); }
    .agency-header__overall-max { font-size: .95rem; color: var(--gray-500); margin-inline-start: -.35rem; }
    .agency-header__overall-count { font-size: .75rem; color: var(--gray-500); }
    .agency-header__rate-cta, .agency-header__share { flex: 0 0 auto; white-space: nowrap; }
    .stars { color: var(--gray-300); font-size: 1.1rem; line-height: 1; }
    .stars--sm { font-size: .85rem; }
    .stars .star--filled { color: var(--warning-text); }
    .rating-breakdown__row { display: flex; align-items: center; gap: .75rem; margin-bottom: .6rem; }
    .rating-breakdown__label { flex: 0 0 130px; font-size: .85rem; color: var(--gray-700); }
    .rating-breakdown__bar { flex: 1; height: 8px; background: var(--gray-100); border-radius: 999px; overflow: hidden; }
    .rating-breakdown__bar-fill { height: 100%; background: var(--warning); border-radius: 999px; }
    .rating-breakdown__value { flex: 0 0 40px; text-align: end; font-size: .8rem; color: var(--gray-500); }
    .rate-card__loading { display: flex; justify-content: center; padding: 1.5rem 0; }
    .rate-card__separate-note { margin: -.5rem 0 1rem; font-size: .8rem; color: var(--gray-500); }
    .rate-card__login { display: inline-flex; margin-top: .75rem; }
    .rating-form { display: flex; flex-direction: column; gap: 1rem; }
    .rating-form__question { margin: 0 0 .25rem; font-weight: 700; color: var(--gray-800); }
    .rating-form__edit-hint { margin: 0; font-size: .85rem; color: var(--warning-text); background: var(--warning-soft); padding: .5rem .75rem; border-radius: 8px; }
    .rating-form__criterion { display: flex; align-items: center; justify-content: space-between; gap: .35rem 1rem; flex-wrap: wrap; padding: .45rem .5rem; border-radius: 8px; border: 1px solid transparent; }
    .rating-form__criterion--missing { border-color: rgba(220, 38, 38, .35); background: var(--danger-soft); }
    .rating-form__criterion-text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 12rem; }
    .rating-form__criterion-label { font-weight: 600; color: var(--gray-800); }
    .rating-form__criterion-hint { font-size: .75rem; color: var(--gray-500); }
    .rating-form__error { margin: .25rem 0 0; color: var(--danger-text); font-size: .85rem; }
    .rating-form__counter { align-self: flex-end; font-size: .72rem; color: var(--text-muted); }
    .star-input { display: flex; gap: .25rem; }
    .star-input button { background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--gray-300); line-height: 1; padding: 0; min-width: 32px; min-height: 32px; }
    .star-input__btn--filled { color: var(--warning-text); }
    .rating-form textarea { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: .6rem; font-family: inherit; resize: vertical; background: var(--surface); color: var(--gray-800); }
    .rating-list { display: flex; flex-direction: column; gap: 1rem; }
    .rating-item { display: flex; gap: .75rem; }
    .rating-item__avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .rating-item__body { min-width: 0; flex: 1; }
    .rating-item__header { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .rating-item__name { font-weight: 600; font-size: .9rem; color: var(--gray-800); }
    .rating-item__date { font-size: .75rem; color: var(--gray-500); margin-inline-start: auto; }
    .rating-item__comment { margin: .35rem 0 0; font-size: .9rem; color: var(--gray-700); overflow-wrap: anywhere; }
    @media (max-width: 640px) { .agency-header__overall, .agency-header__rate-cta { width: 100%; } .rating-breakdown__label { flex-basis: 96px; } }
  `]
})
export class AgencyPublicPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly agenciesApi = inject(AgenciesApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly pageMeta = inject(PageMetaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly lookups = inject(LookupsApiService);
  private readonly shareUrls = inject(PropertyShareUrlService);
  private readonly lang = inject(LanguageService);

  readonly criteria = AGENCY_RATING_CRITERIA;
  readonly starsFn = starsFor;
  readonly commentMaxLength = AGENCY_RATING_COMMENT_MAX_LENGTH;

  readonly summary = signal<AgencyRatingSummaryDto | null>(null);
  readonly ratings = signal<AgencyRatingDto[]>([]);
  readonly ratingsLoading = signal(false);
  readonly eligibility = signal<AgencyRatingEligibilityDto | null>(null);
  readonly eligibilityLoading = signal(false);
  readonly submittingRating = signal(false);
  readonly submitAttempted = signal(false);

  // كل محور يبدأ بلا اختيار (0) ويجب أن يختاره المستخدم بنفسه، فلا يُرسَل تقييم "ممتاز" لمحور لم يلمسه.
  readonly ratingForm = this.fb.group({
    service: this.fb.control(0, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    professionalism: this.fb.control(0, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    reliability: this.fb.control(0, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    overallExperience: this.fb.control(0, { nonNullable: true, validators: [Validators.min(1), Validators.max(5)] }),
    comment: this.fb.control('', {
      nonNullable: true,
      validators: [Validators.maxLength(AGENCY_RATING_COMMENT_MAX_LENGTH), notBlankIfPresent]
    })
  });

  readonly isLoggedIn = computed(() => !!this.authService.getCurrentUserId());
  /** الخادم هو من يقرّر؛ قبل وصول الأهلية لا نخفي القسم. */
  readonly isMemberOrOwner = computed(() => !!this.eligibility()?.isMemberOrOwner);
  readonly isEditingRating = computed(() => !!this.eligibility()?.alreadyRated);
  readonly showRateCta = computed(() => !this.isMemberOrOwner());

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly agency = signal<Agency | null>(null);
  readonly branches = computed<AgencyBranch[]>(() => this.agency()?.branches ?? []);
  readonly branchPoints = computed<OfficeMapPoint[]>(() => this.branches()
    .filter(b => b.latitude != null && b.longitude != null)
    .map(b => ({ id: b.id, latitude: b.latitude as number, longitude: b.longitude as number, label: b.name, main: b.isMain })));
  /** أسماء المحافظات والمناطق التي فيها فروع، بلغة الزائر. */
  private readonly placeNames = signal<Map<string, StructuredLocationLookup>>(new Map());
  private readonly currentLang = signal(this.lang.getCurrent());
  readonly listings = signal<Property[]>([]);
  readonly listingsLoading = signal(false);
  readonly hasMore = signal(false);
  private listingsPage = 1;

  /**
   * Tabs (P7-D08): the agency's live listings, and its concluded deals. Sold and rented listings are
   * not in search; this page is the only place they are listed, as a record of the office's work.
   */
  readonly activeTab = signal<AgencyListingsTab>('active');
  readonly soldCount = signal(0);
  readonly rentedCount = signal(0);

  /**
   * Records one action on the office page. Fire-and-forget: errors are swallowed (the API call already
   * skips the error toast), so a statistic never gets in the way of the visitor.
   */
  track(event: AgencyProfileEvent, agencyId = this.agency()?.id): void {
    if (!agencyId) return;
    this.agenciesApi.recordEvent(agencyId, event).pipe(catchError(() => of(null))).subscribe();
  }

  /** Native share sheet where there is one, else copy the link. The shared URL is the clean office URL. */
  async share(a: Agency): Promise<void> {
    const url = `${this.shareUrls.getSiteOrigin()}/offices/${encodeURIComponent(a.slug)}`;
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    try {
      if (nav?.share) {
        await nav.share({ title: a.name, url });
        this.track({ type: 'Share', channel: 'NativeShare' }, a.id);
        return;
      }
      await nav?.clipboard?.writeText(url);
      this.toast.success(this.translate.instant('OFFICE_STATS.LINK_COPIED'));
      this.track({ type: 'Share', channel: 'CopyLink' }, a.id);
    } catch {
      // Cancelled share sheet or no clipboard permission: nothing was shared, nothing to count.
    }
  }

  /** «المنطقة، المحافظة» بلغة الزائر؛ null إن لم تصل الأسماء بعد. */
  branchPlace(b: AgencyBranch): string | null {
    const names = this.placeNames();
    const parts = [names.get(`d${b.districtId}`), names.get(`g${b.governorateId}`)]
      .filter((p): p is StructuredLocationLookup => !!p)
      .map(p => pickLocalizedName(p, this.currentLang()));
    return parts.length ? parts.join(this.currentLang() === 'ar' ? '، ' : ', ') : null;
  }

  /** رابط اتجاهات خارجي لفرع له إحداثيات (يفتح تطبيق الخرائط على الجوال). */
  directionsUrl(b: AgencyBranch): string | null {
    if (b.latitude == null || b.longitude == null) return null;
    return `https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`;
  }

  private loadBranchPlaces(branches: AgencyBranch[]): void {
    if (!branches.length) return;
    const governorateIds = [...new Set(branches.filter(b => b.districtId).map(b => b.governorateId))];
    forkJoin({
      governorates: this.lookups.getGovernorates().pipe(catchError(() => of([] as StructuredLocationLookup[]))),
      districts: governorateIds.length
        ? forkJoin(governorateIds.map(id => this.lookups.getDistricts(id).pipe(catchError(() => of([] as StructuredLocationLookup[])))))
        : of([] as StructuredLocationLookup[][])
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ governorates, districts }) => {
      const map = new Map<string, StructuredLocationLookup>();
      governorates.forEach(g => map.set(`g${g.id}`, g));
      districts.flat().forEach(d => map.set(`d${d.id}`, d));
      this.placeNames.set(map);
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.pageMeta.clear());
    this.lang.currentLang$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(l => this.currentLang.set(l));

    this.route.paramMap
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.notFound.set(false);
          this.agency.set(null);
          this.listings.set([]);
          this.hasMore.set(false);
          this.activeTab.set('active');
          this.soldCount.set(0);
          this.rentedCount.set(0);
          this.summary.set(null);
          this.ratings.set([]);
          this.eligibility.set(null);
          this.ratingForm.reset();
        }),
        // catchError داخل switchMap: 404 لمكتب لا يُنهي الاشتراك، فيعمل الانتقال
        // إلى slug آخر بعده.
        switchMap(params =>
          this.agenciesApi.getBySlug(params.get('slug') ?? '').pipe(catchError(() => of(null)))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(agency => {
          if (!agency) {
            this.notFound.set(true);
            this.loading.set(false);
            this.pageMeta.markNotFound();
            return;
          }

          this.agency.set(agency);
          this.loading.set(false);
          this.loadBranchPlaces(agency.branches ?? []);
          this.track({ type: 'ProfileView', source: visitSource() }, agency.id);
          this.pageMeta.applyDynamic({
            title: agency.name,
            description: agency.description,
            path: `/offices/${agency.slug}`,
            image: agency.logoUrl
          });
          this.loadListings(agency.id, 1);
          this.loadClosedDealCounts(agency.id);
          this.loadRatings(agency.id);
          if (this.isLoggedIn()) {
            this.loadEligibility(agency.id);
          }
      });
  }

  private loadRatings(agencyId: string): void {
    this.ratingsLoading.set(true);
    this.agenciesApi
      .getRatings(agencyId, 1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: summary => {
          this.summary.set(summary);
          this.ratings.set(summary.ratings ?? []);
          this.ratingsLoading.set(false);
        },
        // خادم أقدم بلا تقييم مكاتب: تبقى الصفحة صالحة وتُعرض "لم يُقيَّم بعد".
        error: () => this.ratingsLoading.set(false)
      });
  }

  private loadEligibility(agencyId: string): void {
    this.eligibilityLoading.set(true);
    this.agenciesApi
      .getRatingEligibility(agencyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: eligibility => {
          this.eligibility.set(eligibility);
          this.eligibilityLoading.set(false);

          // سبق للمستخدم تقييم المكتب: عبّئ النموذج بقيمه ليعدّلها بدل البدء من صفر.
          const existing = eligibility.existingRating;
          if (existing) {
            this.ratingForm.patchValue({
              service: existing.service,
              professionalism: existing.professionalism,
              reliability: existing.reliability,
              overallExperience: existing.overallExperience,
              comment: existing.comment ?? ''
            });
          }
        },
        error: () => this.eligibilityLoading.set(false)
      });
  }

  setCriterion(key: string, value: number): void {
    const control = this.ratingForm.get(key);
    control?.setValue(value);
    control?.markAsTouched();
  }

  showMissingCriteria(): boolean {
    return this.submitAttempted() && AGENCY_RATING_CRITERIA.some(c => this.ratingForm.controls[c.key].invalid);
  }

  scrollToRate(): void {
    document.getElementById('rate-agency')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  submitRating(): void {
    const agencyId = this.agency()?.id;
    this.submitAttempted.set(true);

    if (!agencyId || this.ratingForm.invalid) {
      this.ratingForm.markAllAsTouched();
      return;
    }

    const raw = this.ratingForm.getRawValue();
    this.submittingRating.set(true);

    this.agenciesApi
      .submitRating(agencyId, {
        service: raw.service,
        professionalism: raw.professionalism,
        reliability: raw.reliability,
        overallExperience: raw.overallExperience,
        comment: raw.comment?.trim() || null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const wasEditing = this.isEditingRating();
          this.toast.success(this.translate.instant(wasEditing ? 'AGENCY_RATING.UPDATE_SUCCESS' : 'AGENCY_RATING.SUCCESS'));
          this.submittingRating.set(false);
          this.submitAttempted.set(false);
          this.loadRatings(agencyId);
          this.loadEligibility(agencyId);
        },
        error: err => {
          // الخادم يشرح سبب الرفض في body.message (شرط التفاعل، مكتبي، ...)؛ نعرضه كما هو.
          const backendMessage = err?.error?.message as string | undefined;
          this.toast.error(backendMessage || this.translate.instant('AGENCY_RATING.ERROR'));
          this.submittingRating.set(false);
        }
      });
  }

  criterionAverage(key: string): number {
    const s = this.summary();
    if (!s) {
      return 0;
    }
    switch (key) {
      case 'service': return s.averageService;
      case 'professionalism': return s.averageProfessionalism;
      case 'reliability': return s.averageReliability;
      case 'overallExperience': return s.averageOverallExperience;
      default: return 0;
    }
  }

  loadMore(): void {
    const agency = this.agency();
    if (agency) this.loadListings(agency.id, this.listingsPage + 1);
  }

  selectTab(tab: AgencyListingsTab): void {
    const agency = this.agency();
    if (!agency || this.activeTab() === tab) return;

    this.activeTab.set(tab);
    this.listings.set([]);
    this.hasMore.set(false);
    this.loadListings(agency.id, 1);
  }

  emptyListingsKey(): string {
    switch (this.activeTab()) {
      case 'sold': return 'AGENCY_PUBLIC.NO_SOLD';
      case 'rented': return 'AGENCY_PUBLIC.NO_RENTED';
      default: return 'AGENCY_PUBLIC.NO_LISTINGS';
    }
  }

  /** A reserved listing on the live tab, or anything on a closed-deals tab, is drawn lighter. */
  isMuted(listing: Property): boolean {
    return this.activeTab() !== 'active' || isReservedListing(listing);
  }

  tagKey(listing: Property): string | null {
    return listingStatusTagKey(listing);
  }

  tagClass(listing: Property): string {
    return `badge--${listingLifecycle(listing)}`;
  }

  /** One page of one row per tab is enough to learn how many concluded deals the office has. */
  private loadClosedDealCounts(agencyId: string): void {
    const count = (status: 'Sold' | 'Rented', target: (n: number) => void): void => {
      this.propertyApi
        .getPropertiesPaged({ agencyId, status, page: 1, pageSize: 1 })
        .pipe(takeUntilDestroyed(this.destroyRef))
        // Best-effort: without the count the tab is simply not offered.
        .subscribe({ next: result => target(result.totalCount), error: () => target(0) });
    };

    count('Sold', n => this.soldCount.set(n));
    count('Rented', n => this.rentedCount.set(n));
  }

  private loadListings(agencyId: string, page: number): void {
    this.listingsLoading.set(true);
    const tab = this.activeTab();
    const status = tab === 'sold' ? 'Sold' : tab === 'rented' ? 'Rented' : undefined;

    this.propertyApi
      .getPropertiesPaged({ agencyId, ...(status ? { status } : {}), page, pageSize: LISTINGS_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          // A reply for the tab the visitor already left must not overwrite the one now on screen.
          if (this.activeTab() !== tab) {
            return;
          }
          this.listingsPage = page;
          this.listings.update(current => (page === 1 ? result.items : [...current, ...result.items]));
          this.hasMore.set(result.hasNext);
          this.listingsLoading.set(false);
        },
        error: () => this.listingsLoading.set(false)
      });
  }

  listingPrice(listing: Property): string {
    const currency = listing.currencyCode ?? '';
    const price = listing.purchasePrice ?? listing.coldRent ?? listing.warmRent;
    return price ? `${price} ${currency}`.trim() : '';
  }
}
