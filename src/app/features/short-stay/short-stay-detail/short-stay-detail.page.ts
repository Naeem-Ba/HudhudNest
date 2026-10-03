import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { ShortStayBookingApiService } from '../../../core/api/short-stay-booking-api.service';
import { LookupsApiService, LookupAmenity } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  AccommodationUnitDto,
  PaymentMethod,
  PricingBreakdown,
  RoomTypeDto,
  ShortStayListing,
  UnitAvailabilityRange
} from '../../../core/models/short-stay.model';
import { DateRangePickerComponent, DateRangeValue } from '../../../shared/ui/date-range-picker.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';
import { PageMetaService } from '../../../core/services/page-meta.service';

// حالات UnitBookingRange التي تُعتبر فعلياً "محجوزة" أمام ضيف جديد. Pending
// مستثناة عمداً — طلبات متعددة يمكن أن تتنافس على نفس التاريخ إلى أن يختار
// المضيف واحداً منها (راجع قرارات المشروع المعمارية).
const BLOCKING_STATUSES = new Set(['Reserved', 'CheckedIn', 'Blocked']);

@Component({
  selector: 'app-short-stay-detail-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, DateRangePickerComponent, ImageFallbackDirective],
  templateUrl: './short-stay-detail.page.html',
  styleUrls: ['./short-stay-detail.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShortStayDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly listingsApi = inject(ShortStayListingApiService);
  private readonly bookingsApi = inject(ShortStayBookingApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageMeta = inject(PageMetaService);

  readonly listing = signal<ShortStayListing | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly fallbackImage = '/images/no-image.svg';

  readonly blockedRanges = signal<Array<{ checkIn: string; checkOut: string }>>([]);
  private readonly allAmenities = signal<LookupAmenity[]>([]);
  readonly listingAmenities = computed<LookupAmenity[]>(() => {
    const listing = this.listing();
    if (!listing) return [];
    const ids = new Set(listing.amenityIds);
    return this.allAmenities().filter(a => ids.has(a.id));
  });

  // MVP: الحجز يستهدف الوحدة الأولى النشطة من نوع الغرفة الأول — اختيار نوع/وحدة
  // متعددة يُؤجَّل لدفعة واجهة لاحقة (قرار المشروع رقم 2).
  readonly bookableUnit = computed<{ roomType: RoomTypeDto; unit: AccommodationUnitDto } | null>(() => {
    const listing = this.listing();
    if (!listing) return null;
    for (const roomType of listing.roomTypes) {
      const unit = roomType.units.find(u => u.isActive);
      if (unit) return { roomType, unit };
    }
    return null;
  });

  checkIn: string | null = null;
  checkOut: string | null = null;
  adults = 1;
  children = 0;
  infants = 0;
  paymentMethod: Exclude<PaymentMethod, 'OnlinePayment'> = 'PayOnArrival';
  houseRulesAccepted = false;

  readonly pricing = signal<PricingBreakdown | null>(null);
  readonly pricingLoading = signal(false);
  readonly pricingError = signal('');
  readonly submitting = signal(false);

  readonly isOwner = computed(() => {
    const listing = this.listing();
    const userId = this.auth.getCurrentUserId();
    return !!listing && !!userId && listing.ownerId === userId;
  });

  readonly minNights = computed(() => {
    const unit = this.bookableUnit();
    if (!unit) return 1;
    return unit.roomType.minimumStayRules.reduce((max, rule) => Math.max(max, rule.minimumNights), 1);
  });

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.pageMeta.clear());
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error.set('SHORTSTAY.DETAIL.NOT_FOUND'); this.pageMeta.markNotFound(); return; }
    this.load(id);

    this.lookupsApi.getAmenities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: items => this.allAmenities.set(items), error: () => this.allAmenities.set([]) });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');

    this.listingsApi.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: listing => {
        this.listing.set(listing);
        this.pageMeta.applyDynamic({ title: listing.title, description: listing.description, path: `/short-stay/${listing.id}` });
        this.loading.set(false);
        this.loadAvailability();
      },
      error: (err: unknown) => {
        this.error.set('SHORTSTAY.DETAIL.LOAD_ERROR');
        // Only a definitive 404 is a reason to de-index; a transient failure must not be.
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.pageMeta.markNotFound();
        }
        this.loading.set(false);
      }
    });
  }

  private loadAvailability(): void {
    const unit = this.bookableUnit();
    if (!unit) return;

    const from = new Date();
    const to = new Date(from.getTime() + 365 * 86_400_000);

    this.bookingsApi.getUnitAvailability(unit.unit.id, this.toIso(from), this.toIso(to))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ranges: UnitAvailabilityRange[]) => {
          this.blockedRanges.set(
            ranges.filter(r => BLOCKING_STATUSES.has(r.status)).map(r => ({ checkIn: r.checkIn, checkOut: r.checkOut }))
          );
        },
        error: () => this.blockedRanges.set([])
      });
  }

  onRangeChange(value: DateRangeValue): void {
    this.checkIn = value.checkIn;
    this.checkOut = value.checkOut;
    this.refreshPricing();
  }

  onGuestsChange(): void {
    this.refreshPricing();
  }

  private refreshPricing(): void {
    const unit = this.bookableUnit();
    if (!unit || !this.checkIn || !this.checkOut) {
      this.pricing.set(null);
      return;
    }

    this.pricingLoading.set(true);
    this.pricingError.set('');

    this.bookingsApi
      .getPricingPreview(unit.unit.id, this.checkIn, this.checkOut, this.adults, this.children, this.infants)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: breakdown => { this.pricing.set(breakdown); this.pricingLoading.set(false); },
        error: () => {
          this.pricing.set(null);
          this.pricingLoading.set(false);
          this.pricingError.set('SHORTSTAY.DETAIL.PRICING_ERROR');
        }
      });
  }

  get canSubmitBooking(): boolean {
    return !!this.bookableUnit() && !!this.checkIn && !!this.checkOut &&
      !!this.pricing() && this.houseRulesAccepted && !this.submitting();
  }

  submitBooking(): void {
    if (!this.auth.getAccessToken()) {
      this.router.navigate(['/auth/login']);
      return;
    }

    const unit = this.bookableUnit();
    if (!unit || !this.checkIn || !this.checkOut || !this.canSubmitBooking) return;

    this.submitting.set(true);

    this.bookingsApi.create({
      unitId: unit.unit.id,
      checkIn: this.checkIn,
      checkOut: this.checkOut,
      adults: this.adults,
      children: this.children,
      infants: this.infants,
      paymentMethod: this.paymentMethod,
      houseRulesAccepted: this.houseRulesAccepted
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.DETAIL.BOOKING_SUCCESS'), 'success');
        this.router.navigate(['/short-stay/bookings']);
      },
      error: err => {
        this.submitting.set(false);
        const message = err?.status === 409
          ? 'SHORTSTAY.DETAIL.BOOKING_CONFLICT'
          : 'SHORTSTAY.DETAIL.BOOKING_ERROR';
        this.toast.show(this.translate.instant(message), 'error');
        // التواريخ لم تعد متاحة على الأرجح — أعد تحميل التوفر ليعكس ذلك فوراً.
        if (err?.status === 409) this.loadAvailability();
      }
    });
  }

  mapsUrl(listing: ShortStayListing): string | null {
    if (listing.latitude === null || listing.longitude === null) return null;
    return `https://www.openstreetmap.org/?mlat=${listing.latitude}&mlon=${listing.longitude}#map=15/${listing.latitude}/${listing.longitude}`;
  }

  private toIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
