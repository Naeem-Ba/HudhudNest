import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LookupsApiService, LookupAmenity } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  AccommodationTypeDto,
  LocationVisibility,
  PricingRuleDto,
  ShortStayListing
} from '../../../core/models/short-stay.model';

type PricingRuleForm = {
  ruleType: PricingRuleDto['ruleType'];
  dayOfWeek: number | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  pricePerNight: number;
};

@Component({
  selector: 'app-short-stay-listing-form-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule],
  templateUrl: './short-stay-listing-form.page.html',
  styleUrls: ['./short-stay-listing-form.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShortStayListingFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ShortStayListingApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly listingId = signal<string | null>(null);
  readonly listing = signal<ShortStayListing | null>(null);
  readonly accommodationTypes = signal<AccommodationTypeDto[]>([]);
  readonly amenityCatalog = signal<LookupAmenity[]>([]);
  readonly selectedAmenityIds = signal<Set<string>>(new Set());
  readonly pricingRules = signal<PricingRuleForm[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploadingPhotos = signal(false);
  readonly togglingPublish = signal(false);

  // ── حقول الإنشاء (وضع "جديد" فقط) ──
  accommodationTypeId: number | null = null;
  defaultBasePricePerNight = 0;

  // ── حقول التعديل (كلا الوضعين بعد الإنشاء) ──
  title = '';
  description = '';
  capacity = 2;
  bedrooms = 1;
  bathrooms = 1;
  checkInTime = '14:00';
  checkOutTime = '11:00';
  selfCheckInEnabled = false;
  instantBookingEnabled = true;
  requestBookingEnabled = false;
  latitude = 0;
  longitude = 0;
  city = '';
  locationVisibility: LocationVisibility = 'Exact';
  cleaningFee = 0;
  extraGuestFee = 0;
  extraBedFee = 0;
  allowsSmoking = false;
  allowsParties = false;
  allowsPets = false;
  quietHoursStart: string | null = null;
  quietHoursEnd: string | null = null;
  customRulesText = '';
  cancellationFreeCancellationDays = 3;
  cancellationDepositRefundable = true;
  cancellationCustomTermsText = '';
  depositPercentage: number | null = null;

  get isEditMode(): boolean { return !!this.listingId(); }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.listingId.set(id);

    this.lookupsApi.getAmenities().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => this.amenityCatalog.set(items), error: () => this.amenityCatalog.set([])
    });

    if (id) {
      this.loadForEdit(id);
    } else {
      this.api.getAccommodationTypes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: types => this.accommodationTypes.set(types), error: () => this.accommodationTypes.set([])
      });
    }
  }

  private loadForEdit(id: string): void {
    this.loading.set(true);
    this.api.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: listing => {
        this.listing.set(listing);
        this.applyListingToForm(listing);
        this.loading.set(false);
      },
      error: () => {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.LOAD_ERROR'), 'error');
        this.loading.set(false);
      }
    });
  }

  private applyListingToForm(listing: ShortStayListing): void {
    this.title = listing.title;
    this.description = listing.description;
    this.capacity = listing.capacity;
    this.bedrooms = listing.bedrooms;
    this.bathrooms = listing.bathrooms;
    this.checkInTime = listing.checkInTime.slice(0, 5);
    this.checkOutTime = listing.checkOutTime.slice(0, 5);
    this.selfCheckInEnabled = listing.selfCheckInEnabled;
    this.instantBookingEnabled = listing.instantBookingEnabled;
    this.requestBookingEnabled = listing.requestBookingEnabled;
    this.latitude = listing.latitude ?? 0;
    this.longitude = listing.longitude ?? 0;
    this.city = listing.city ?? '';
    this.locationVisibility = listing.locationVisibility;
    this.cleaningFee = listing.cleaningFee;
    this.extraGuestFee = listing.extraGuestFee;
    this.extraBedFee = listing.extraBedFee;
    this.allowsSmoking = listing.allowsSmoking;
    this.allowsParties = listing.allowsParties;
    this.allowsPets = listing.allowsPets;
    this.quietHoursStart = listing.quietHoursStart?.slice(0, 5) ?? null;
    this.quietHoursEnd = listing.quietHoursEnd?.slice(0, 5) ?? null;
    this.customRulesText = listing.customRulesText ?? '';
    this.cancellationFreeCancellationDays = listing.cancellationFreeCancellationDays;
    this.cancellationDepositRefundable = listing.cancellationDepositRefundable;
    this.cancellationCustomTermsText = listing.cancellationCustomTermsText ?? '';
    this.depositPercentage = null;
    this.selectedAmenityIds.set(new Set(listing.amenityIds));

    const roomType = listing.roomTypes[0];
    this.pricingRules.set(
      (roomType?.pricingRules ?? []).map(r => ({
        ruleType: r.ruleType, dayOfWeek: r.dayOfWeek,
        dateRangeStart: r.dateRangeStart, dateRangeEnd: r.dateRangeEnd, pricePerNight: r.pricePerNight
      }))
    );
  }

  toggleAmenity(id: string): void {
    this.selectedAmenityIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  isAmenitySelected(id: string): boolean {
    return this.selectedAmenityIds().has(id);
  }

  addPricingRule(): void {
    this.pricingRules.update(rules => [
      ...rules, { ruleType: 'Weekend', dayOfWeek: null, dateRangeStart: null, dateRangeEnd: null, pricePerNight: 0 }
    ]);
  }

  removePricingRule(index: number): void {
    this.pricingRules.update(rules => rules.filter((_, i) => i !== index));
  }

  createListing(): void {
    if (!this.accommodationTypeId) {
      this.toast.show(this.translate.instant('SHORTSTAY.FORM.SELECT_TYPE'), 'error');
      return;
    }

    this.saving.set(true);
    this.api.create({
      accommodationTypeId: this.accommodationTypeId,
      title: this.title,
      description: this.description,
      capacity: this.capacity,
      bedrooms: this.bedrooms,
      bathrooms: this.bathrooms,
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      latitude: this.latitude,
      longitude: this.longitude,
      defaultBasePricePerNight: this.defaultBasePricePerNight
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: created => {
        this.saving.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.CREATE_SUCCESS'), 'success');
        this.router.navigate(['/short-stay/manage', created.id]);
      },
      error: () => {
        this.saving.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.SAVE_ERROR'), 'error');
      }
    });
  }

  saveChanges(): void {
    const id = this.listingId();
    if (!id) return;

    this.saving.set(true);

    // ملاحظة: المحافظة/المنطقة/الحي وحقول المسبح غير مُحرَّرة في نموذج MVP هذا —
    // تُرسَل null فلا تتغيَّر القيمة الحالية إن وُجدت (الباك اند يقبلها اختيارية).
    const update$ = this.api.update(id, {
      title: this.title,
      description: this.description,
      capacity: this.capacity,
      bedrooms: this.bedrooms,
      bathrooms: this.bathrooms,
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      selfCheckInEnabled: this.selfCheckInEnabled,
      instantBookingEnabled: this.instantBookingEnabled,
      requestBookingEnabled: this.requestBookingEnabled,
      latitude: this.latitude,
      longitude: this.longitude,
      governorateId: null,
      districtId: null,
      neighborhoodId: null,
      city: this.city || null,
      locationVisibility: this.locationVisibility,
      poolType: null,
      poolLocation: null,
      poolIsSeasonal: null,
      poolIsHeated: null,
      cleaningFee: this.cleaningFee,
      extraGuestFee: this.extraGuestFee,
      extraBedFee: this.extraBedFee,
      allowsSmoking: this.allowsSmoking,
      allowsParties: this.allowsParties,
      allowsPets: this.allowsPets,
      quietHoursStart: this.quietHoursStart,
      quietHoursEnd: this.quietHoursEnd,
      customRulesText: this.customRulesText || null,
      cancellationFreeCancellationDays: this.cancellationFreeCancellationDays,
      cancellationDepositRefundable: this.cancellationDepositRefundable,
      cancellationCustomTermsText: this.cancellationCustomTermsText || null,
      depositPercentage: this.depositPercentage
    });

    const amenities$ = this.api.setAmenities(id, [...this.selectedAmenityIds()]);

    const roomTypeId = this.listing()?.roomTypes[0]?.id;
    const pricing$ = roomTypeId
      ? this.api.setPricingRules(roomTypeId, this.pricingRules())
      : undefined;

    forkJoin(pricing$ ? [update$, amenities$, pricing$] : [update$, amenities$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.show(this.translate.instant('SHORTSTAY.FORM.SAVE_SUCCESS'), 'success');
          this.loadForEdit(id);
        },
        error: () => {
          this.saving.set(false);
          this.toast.show(this.translate.instant('SHORTSTAY.FORM.SAVE_ERROR'), 'error');
        }
      });
  }

  onPhotosSelected(event: Event): void {
    const id = this.listingId();
    const input = event.target as HTMLInputElement;
    if (!id || !input.files || input.files.length === 0) return;

    this.uploadingPhotos.set(true);
    this.api.uploadPhotos(id, Array.from(input.files)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.uploadingPhotos.set(false);
        input.value = '';
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTOS_SUCCESS'), 'success');
        this.loadForEdit(id);
      },
      error: () => {
        this.uploadingPhotos.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTOS_ERROR'), 'error');
      }
    });
  }

  togglePublish(): void {
    const id = this.listingId();
    const current = this.listing();
    if (!id || !current) return;

    this.togglingPublish.set(true);
    const action$ = current.isPublished ? this.api.unpublish(id) : this.api.publish(id);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.togglingPublish.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PUBLISH_TOGGLE_SUCCESS'), 'success');
        this.loadForEdit(id);
      },
      error: () => {
        this.togglingPublish.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PUBLISH_TOGGLE_ERROR'), 'error');
      }
    });
  }
}
