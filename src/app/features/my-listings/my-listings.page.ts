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
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { filter, take } from 'rxjs';

import { PropertyApiService } from '../../core/api/property-api.service';
import { ShortStayListingApiService } from '../../core/api/short-stay-listing-api.service';
import { ProfileService } from '../../core/api/profile.service';
import { PlansApiService } from '../../core/api/plans-api.service';
import { ListingFeesApiService } from '../../core/api/listing-fees-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { Property } from '../../core/models/property.model';
import { SkeletonCardGridComponent } from '../../shared/ui/skeleton-card-grid.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { uiNumberLocale } from '../../core/i18n/ui-language';
import {
  OWNER_SELECTABLE_STATUSES,
  OwnerSelectableStatus,
  isClosedDealListing,
  listingLifecycle,
  listingStatusTagKey
} from '../../shared/utils/listing-status';
import { ListingViewCountComponent } from '../../shared/ui/listing-view-count.component';

@Component({
  selector: 'app-my-listings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ListingViewCountComponent,
    CommonModule,
    RouterModule,
    TranslateModule,
    SkeletonCardGridComponent,
    EmptyStateComponent,
    ImageFallbackDirective
  ],
  templateUrl: './my-listings.page.html',
  styleUrls: ['./my-listings.page.scss']
})
export class MyListingsPage implements OnInit {
  private readonly api = inject(PropertyApiService);
  private readonly shortStayApi = inject(ShortStayListingApiService);
  private readonly profile = inject(ProfileService);
  private readonly plansApi = inject(PlansApiService);
  private readonly feesApi = inject(ListingFeesApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly listings = signal<Property[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly deletingId = signal<string | null>(null);
  readonly publishingId = signal<string | null>(null);
  readonly extendingId = signal<string | null>(null);
  readonly statusChangingId = signal<string | null>(null);

  readonly selectableStatuses = OWNER_SELECTABLE_STATUSES;

  /**
   * Listings whose featured request is waiting for an administrator to confirm the payment.
   * The listing is not featured yet; the card says so instead of offering to request again.
   */
  readonly pendingFeaturedIds = signal<ReadonlySet<string>>(new Set());

  readonly fallbackImage = '/images/no-image.svg';
  private readonly now = Date.now();

  /**
   * ✅ إضافة: مؤشر "X من Y إعلان" — كان مفقوداً بالكامل من واجهة المستخدم العادي (فقط
   * لوحة الأدمن كانت تعرض listingLimit). يطابق منطق الباك اند الموحَّد
   * (ActiveListingCounter: Property + ShortStayListing، الحالة Expired مستثناة فقط —
   * راجع CountActiveListingsByOwnerAsync) حتى لو كانت هذه الصفحة تعرض عقارات البيع/
   * الإيجار فقط؛ إعلانات الإقامة القصيرة تُدار من صفحتها الخاصة لكنها تُحتسب هنا لأنها
   * تستهلك من نفس الحصة.
   */
  readonly planListingLimit = signal<number | null | undefined>(undefined); // undefined = loading, null = unlimited
  readonly shortStayActiveCount = signal(0);
  // Expired listings and concluded deals (Sold/Rented) no longer count against the plan: the API
  // excludes them too (P7-D08), so the number here matches the one the server enforces.
  readonly activePropertiesCount = computed(
    () => this.listings().filter(p => p.status !== 'Expired' && !isClosedDealListing(p)).length
  );
  readonly totalActiveListings = computed(
    () => this.activePropertiesCount() + this.shortStayActiveCount()
  );

  ngOnInit(): void {
    this.loadMyListings();
    this.loadQuotaUsage();
    this.loadPendingFeatured();
  }

  private loadPendingFeatured(): void {
    this.feesApi
      .getMyPendingFeatured()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: rows => this.pendingFeaturedIds.set(new Set(rows.map(r => r.propertyId))),
        // Best-effort: without it the card simply offers the request button, and asking
        // again is safe (the server returns the existing pending fee).
        error: () => this.pendingFeaturedIds.set(new Set())
      });
  }

  /**
   * Featuring is offered for a published, unexpired listing: the server refuses anything
   * else (a hidden listing would be paid-for promotion nobody can see).
   */
  canFeature(property: Property): boolean {
    return this.isPublished(property) && property.status !== 'Expired';
  }

  hasPendingFeatured(property: Property): boolean {
    return !!property.id && this.pendingFeaturedIds().has(property.id);
  }

  private loadQuotaUsage(): void {
    this.shortStayApi
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.shortStayActiveCount.set(items?.length ?? 0),
        // Best-effort: the widget just shows one fewer number if this fails.
        error: () => this.shortStayActiveCount.set(0)
      });

    this.profile.profile$
      .pipe(
        filter((p): p is NonNullable<typeof p> => !!p?.PlanTier),
        take(1),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(profile => {
        this.plansApi
          .getPlans()
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: plans => {
              const plan = plans.find(p => p.tier === profile.PlanTier);
              this.planListingLimit.set(plan ? plan.listingLimit : null);
            },
            error: () => this.planListingLimit.set(null)
          });
      });
  }

  loadMyListings(): void {
    this.loading.set(true);
    this.error.set('');

    // Security boundary: the backend derives the owner from JWT.
    // The frontend must not request all properties and filter ownership locally.
    this.api
      .getMyProperties()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.listings.set(data ?? []);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('MY_LISTINGS.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  edit(id: string | undefined): void {
    if (id) {
      void this.router.navigate(['/properties/edit', id]);
    }
  }

  confirmDelete(id: string | undefined): void {
    if (!id) {
      return;
    }

    const confirmed = confirm(this.translate.instant('MY_LISTINGS.CONFIRM_DELETE'));
    if (confirmed) {
      this.delete(id);
    }
  }

  private delete(id: string): void {
    this.deletingId.set(id);

    this.api
      .deleteProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.listings.update(prev => prev.filter(property => property.id !== id));
          this.toast.show(this.translate.instant('MY_LISTINGS.DELETE_SUCCESS'), 'success');
          this.deletingId.set(null);
        },
        error: () => {
          this.toast.show(this.translate.instant('MY_LISTINGS.DELETE_ERROR'), 'error');
          this.deletingId.set(null);
        }
      });
  }

  /**
   * ملاحظة: الخادم يوفر PUBLISH فقط (نشر لمرة واحدة، بلا رجعة عبر الـ API)
   * لذلك هذا الزر لا يظهر إلا للإعلانات في وضع مسودة، وليس Toggle ثنائي الاتجاه.
   */
  publish(id: string | undefined): void {
    if (!id || this.publishingId()) return;

    this.publishingId.set(id);

    this.api
      .publishProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.listings.update(prev =>
            prev.map(p => (p.id === id ? { ...p, isPublished: true, status: 'Available' } : p))
          );
          this.toast.show(this.translate.instant('MY_LISTINGS.PUBLISH_SUCCESS'), 'success');
          this.publishingId.set(null);
        },
        error: () => {
          this.toast.show(this.translate.instant('MY_LISTINGS.PUBLISH_ERROR'), 'error');
          this.publishingId.set(null);
        }
      });
  }

  /**
   * ✅ إضافة: زر "تمديد الإعلان" الذي يظهر عند اقتراب الانتهاء أو بعده — الطلب فعلياً
   * إلى PropertiesController.RequestExtension (كان موجودًا بالباك اند بلا أي واجهة
   * تستهلكه). لا يُمدَّد الإعلان هنا مباشرة (لا توجد بوابة دفع): الاستجابة عرض سعر
   * (رسوم + رقم مرجع) يُحوَّل لاحقًا لتحويل بنكي يؤكّده مسؤول — تمامًا كما في
   * checkout.page.ts لرسوم الإعلان الأخرى. الطلب مكرَّر آمن: نفس رقم المرجع يعود إن
   * كانت هناك رسوم معلَّقة أصلاً بدل إنشاء رسوم مضاعفة (IsExistingPendingFee بالباك
   * اند)، والإعلان نفسه لا يُلمَس ولا يُكرَّر — فقط ExpiresAt يُمدَّد لاحقًا بعد التأكيد.
   */
  canExtend(property: Property): boolean {
    // الخادم يرفض التمديد (409) لإعلان مباع/مؤجَّر/مؤرشف أو موقوف إداريًا (QA المرحلة 8، P8-D02/D10)؛
    // لا نعرض زرًا يفشل.
    if (property.isTakenDown || ['sold', 'rented', 'archived'].includes(listingLifecycle(property))) {
      return false;
    }
    return property.status === 'Expired' || this.isExpiringSoon(property.expiresAt);
  }

  /** Publishing is refused for a listing the administration took down; the owner sees the reason instead. */
  canPublish(property: Property): boolean {
    return !property.isPublished && !property.isTakenDown;
  }

  extend(id: string | undefined): void {
    if (!id || this.extendingId()) {
      return;
    }

    this.extendingId.set(id);

    this.api
      .requestListingExtension(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: quote => {
          this.extendingId.set(null);
          const messageKey = quote.isExistingPendingFee
            ? 'MY_LISTINGS.EXTEND_ALREADY_PENDING'
            : 'MY_LISTINGS.EXTEND_SUCCESS';
          this.toast.show(
            this.translate.instant(messageKey, {
              amount: quote.amountUsd,
              reference: quote.transactionId
            }),
            'success'
          );
        },
        error: err => {
          this.extendingId.set(null);
          const backendMessage = err?.error?.message as string | undefined;
          this.toast.show(
            backendMessage || this.translate.instant('MY_LISTINGS.EXTEND_ERROR'),
            'error'
          );
        }
      });
  }

  /** Reserved / sold / rented / archived tag for the card; null for an ordinary listing. */
  statusTagKey(property: Property): string | null {
    return listingStatusTagKey(property);
  }

  statusBadgeClass(property: Property): string {
    return `badge--${listingLifecycle(property)}`;
  }

  /** The status the dropdown shows: Expired is not something an owner can choose, so it has no option. */
  currentStatus(property: Property): OwnerSelectableStatus | null {
    const lifecycle = listingLifecycle(property);
    return OWNER_SELECTABLE_STATUSES.find(s => s.toLowerCase() === lifecycle) ?? null;
  }

  /** Only a published listing has a status to manage (a draft is not on the market, an expired one is extended). */
  canChangeStatus(property: Property): boolean {
    return !!property.id && property.isPublished === true && this.currentStatus(property) !== null;
  }

  statusOptionKey(status: OwnerSelectableStatus): string {
    return `LISTING_STATUS.${status.toUpperCase()}`;
  }

  /**
   * Moves the listing to another status. Sold/Rented take it out of search and Archived hides it
   * from the public, so those two ask first; if the owner declines, the dropdown goes back to the
   * stored value (it already shows the new one by then).
   */
  changeStatus(property: Property, select: HTMLSelectElement): void {
    const id = property.id;
    const next = select.value as OwnerSelectableStatus;
    const current = this.currentStatus(property);

    if (!id || this.statusChangingId() || !OWNER_SELECTABLE_STATUSES.includes(next) || next === current) {
      return;
    }

    const confirmKey = next === 'Sold' || next === 'Rented'
      ? 'LISTING_STATUS.CONFIRM_CLOSED'
      : next === 'Archived' ? 'LISTING_STATUS.CONFIRM_ARCHIVED' : null;

    if (confirmKey && !confirm(this.translate.instant(confirmKey))) {
      select.value = current ?? 'Available';
      return;
    }

    this.statusChangingId.set(id);

    this.api
      .updateStatus(id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.listings.update(prev => prev.map(p => (p.id === id ? { ...p, status: next } : p)));
          this.toast.show(this.translate.instant('LISTING_STATUS.CHANGED'), 'success');
          this.statusChangingId.set(null);
        },
        error: () => {
          select.value = current ?? 'Available';
          this.toast.show(this.translate.instant('LISTING_STATUS.CHANGE_ERROR'), 'error');
          this.statusChangingId.set(null);
        }
      });
  }

  openMessages(id: string | undefined): void {
    if (id) {
      this.router.navigate(['/messages', id]);
    }
  }

  getMainImage(property: Property): string {
    return (
      property.mainImageUrl ||
      property.images?.find(image => image.isMain)?.url ||
      property.images?.[0]?.url ||
      property.imageUrls?.[0] ||
      this.fallbackImage
    );
  }

  isPublished(property: Property): boolean {
    return property.isPublished === true || property.status === 'Available';
  }

  getPrice(property: Property): string {
    const price = property.purchasePrice ?? property.warmRent ?? property.coldRent;

    if (!price) {
      return '—';
    }

    const currency = property.currencyCode ?? 'EUR';

    try {
      return new Intl.NumberFormat(uiNumberLocale(), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(price);
    } catch {
      return `${price.toLocaleString(uiNumberLocale())} ${currency}`;
    }
  }

  daysLeft(expiresAt: string | undefined | null): number | null {
    if (!expiresAt) {
      return null;
    }

    const expiry = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiry)) {
      return null;
    }

    return Math.ceil((expiry - this.now) / 86_400_000);
  }

  /**
   * ✅ إصلاح: كان الحد 7 أيام هنا بينما نافذة التنبيه الفعلية بالخادم
   * (ListingLifecyclePolicy.ExpiryWarningLeadTime) هي 5 أيام — فكانت هذه اللافتة
   * تظهر أحيانًا قبل أن يصل أي إشعار فعلي، ما يوحي بتناقض. الرقمان الآن متطابقان.
   */
  isExpiringSoon(expiresAt: string | undefined | null): boolean {
    const days = this.daysLeft(expiresAt);
    return days !== null && days > 0 && days <= 5;
  }

  trackById(index: number, property: Property): string {
    return property.id || String(index);
  }
}