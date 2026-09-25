import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PhotoGuideSheetComponent } from '../../../shared/ui/photo-guide/photo-guide-sheet.component';
import { forkJoin } from 'rxjs';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LookupsApiService, LookupAmenity } from '../../../core/api/lookups-api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import {
  AccommodationTypeDto,
  LocationVisibility,
  PricingRuleDto,
  SHORT_STAY_CURRENCIES,
  ShortStayListing
} from '../../../core/models/short-stay.model';

/** Same limits the backend enforces in AddShortStayListingPhotosCommandHandler. */
const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX_PER_REQUEST = 10;

interface PendingPhoto {
  file: File;
  previewUrl: string;
}

/**
 * `<input type="time">` yields "HH:mm" (or "" once cleared). The API's TimeOnly contract is
 * "HH:mm:ss", so a short value is padded and an empty one becomes null — sending "" or a
 * seconds-less value used to fail model binding with "The Check in time field is empty or invalid".
 */
export function toApiTime(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  return /^\d{2}:\d{2}$/.test(v) ? `${v}:00` : v;
}

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
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, PhotoGuideSheetComponent],
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Flips on the first submit so required-but-empty fields get highlighted, not just toasted. */
  readonly submitAttempted = signal(false);

  readonly listingId = signal<string | null>(null);
  readonly listing = signal<ShortStayListing | null>(null);
  readonly accommodationTypes = signal<AccommodationTypeDto[]>([]);
  readonly amenityCatalog = signal<LookupAmenity[]>([]);
  readonly selectedAmenityIds = signal<Set<string>>(new Set());
  readonly pricingRules = signal<PricingRuleForm[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploadingPhotos = signal(false);
  /** Photography guide (UX only): closing or reading it changes nothing in the form. */
  readonly photoGuideOpen = signal(false);
  /** Photos picked on the create form; uploaded right after the listing exists (the API needs its id). */
  readonly pendingPhotos = signal<PendingPhoto[]>([]);
  readonly maxPhotosPerRequest = PHOTO_MAX_PER_REQUEST;
  readonly togglingPublish = signal(false);

  // ── حقول الإنشاء (وضع "جديد" فقط) ──
  accommodationTypeId: number | null = null;
  defaultBasePricePerNight = 0;
  currencyCode = 'SYP';
  readonly currencies = SHORT_STAY_CURRENCIES;

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

  // Security audit finding (2026-09-18): this form has no UI to edit these five fields yet
  // (governorate/district/neighborhood and pool details — "MVP form", see loadForEdit's
  // comment history). They used to be hardcoded to `null` on every save regardless of the
  // loaded listing's actual values, which is a real clear on this backend's full-replace PUT
  // contract (not a harmless omission) — any listing with pool data or a non-default location
  // breakdown had it silently wiped on the very next edit. Now captured on load and echoed
  // back unchanged on save, exactly like every other read-only-for-now field in this form.
  governorateId: number | null = null;
  districtId: number | null = null;
  neighborhoodId: number | null = null;
  poolType: 'Private' | 'Shared' | null = null;
  poolLocation: 'Indoor' | 'Outdoor' | null = null;
  poolIsSeasonal: boolean | null = null;
  poolIsHeated: boolean | null = null;

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
    this.destroyRef.onDestroy(() => this.pendingPhotos().forEach(p => URL.revokeObjectURL(p.previewUrl)));

    const id = this.route.snapshot.paramMap.get('id');
    this.listingId.set(id);

    this.lookupsApi.getAmenities().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => this.amenityCatalog.set(items), error: () => this.amenityCatalog.set([])
    });

    if (id) {
      this.loadForEdit(id);
    } else {
      this.api.getAccommodationTypes().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: types => this.accommodationTypes.set(types),
        error: () => {
          this.accommodationTypes.set([]);
          this.toast.show(this.translate.instant('SHORTSTAY.FORM.TYPES_LOAD_ERROR'), 'error');
        }
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
    this.currencyCode = listing.currencyCode;
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
    this.governorateId = listing.governorateId;
    this.districtId = listing.districtId;
    this.neighborhoodId = listing.neighborhoodId;
    this.poolType = listing.poolType;
    this.poolLocation = listing.poolLocation;
    this.poolIsSeasonal = listing.poolIsSeasonal;
    this.poolIsHeated = listing.poolIsHeated;
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
    this.depositPercentage = listing.depositPercentage;
    this.selectedAmenityIds.set(new Set(listing.amenityIds));

    const roomType = listing.roomTypes[0];
    this.pricingRules.set(
      (roomType?.pricingRules ?? []).map(r => ({
        ruleType: r.ruleType, dayOfWeek: r.dayOfWeek,
        dateRangeStart: r.dateRangeStart, dateRangeEnd: r.dateRangeEnd, pricePerNight: r.pricePerNight
      }))
    );
  }

  typeLabel(type: AccommodationTypeDto): string {
    return this.translate.currentLang === 'ar' ? type.nameAr : (type.nameEn || type.nameAr);
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

  /**
   * Cleared number inputs bind as null, which the API rejects at model binding with an
   * opaque 400 — so the common mistakes are caught here with the exact field named.
   */
  private firstInvalidFieldKey(includeFees: boolean): string | null {
    const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

    if (!this.title?.trim()) return 'SHORTSTAY.FORM.ERR_TITLE';
    if (!this.description?.trim()) return 'SHORTSTAY.FORM.ERR_DESCRIPTION';
    if (!isNum(this.capacity) || this.capacity < 1) return 'SHORTSTAY.FORM.ERR_CAPACITY';
    if (!isNum(this.bedrooms) || this.bedrooms < 0) return 'SHORTSTAY.FORM.ERR_BEDROOMS';
    if (!isNum(this.bathrooms) || this.bathrooms < 0) return 'SHORTSTAY.FORM.ERR_BATHROOMS';
    if (!this.checkInTime || !this.checkOutTime) return 'SHORTSTAY.FORM.ERR_TIMES';
    if (includeFees && !this.quietHoursStart !== !this.quietHoursEnd) return 'SHORTSTAY.FORM.ERR_QUIET_HOURS';
    if (!isNum(this.latitude) || !isNum(this.longitude)) return 'SHORTSTAY.FORM.ERR_LOCATION';
    if (includeFees && [this.cleaningFee, this.extraGuestFee, this.extraBedFee].some(fee => !isNum(fee) || fee < 0)) {
      return 'SHORTSTAY.FORM.ERR_FEES';
    }
    return null;
  }

  /** Toast the reason and move the user to the first offending field (highlighted via submitAttempted). */
  private rejectSubmit(messageKey: string): void {
    this.toast.show(this.translate.instant(messageKey), 'error');
    const target = this.host.nativeElement.querySelector<HTMLElement>(
      'input.ng-invalid, select.ng-invalid, textarea.ng-invalid'
    );
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    target?.focus?.({ preventScroll: true });
  }

  /** Not every browser lets users clear an optional time input, so offer an explicit reset. */
  clearQuietHours(): void {
    this.quietHoursStart = null;
    this.quietHoursEnd = null;
  }

  createListing(): void {
    this.submitAttempted.set(true);

    if (!this.accommodationTypeId) {
      this.rejectSubmit('SHORTSTAY.FORM.SELECT_TYPE');
      return;
    }

    const invalidKey = this.firstInvalidFieldKey(false);
    if (invalidKey) {
      this.rejectSubmit(invalidKey);
      return;
    }

    if (!(this.defaultBasePricePerNight > 0)) {
      this.rejectSubmit('SHORTSTAY.FORM.PRICE_REQUIRED');
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
      checkInTime: toApiTime(this.checkInTime)!,
      checkOutTime: toApiTime(this.checkOutTime)!,
      latitude: this.latitude,
      longitude: this.longitude,
      defaultBasePricePerNight: this.defaultBasePricePerNight,
      currencyCode: this.currencyCode
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: created => this.uploadPendingPhotosThenOpen(created.id),
      error: err => {
        this.saving.set(false);
        this.handleCreateError(err);
      }
    });
  }

  /**
   * The listing already exists at this point, so a failed upload must never look like a failed
   * create (a retry would create a duplicate and burn plan quota): the user lands on the manage
   * page either way, where photos can be added again.
   */
  private uploadPendingPhotosThenOpen(listingId: string): void {
    const files = this.pendingPhotos().map(p => p.file);
    const open = (): void => {
      this.saving.set(false);
      this.uploadingPhotos.set(false);
      void this.router.navigate(['/short-stay/manage', listingId]);
    };

    if (files.length === 0) {
      this.toast.show(this.translate.instant('SHORTSTAY.FORM.CREATE_SUCCESS'), 'success');
      open();
      return;
    }

    this.uploadingPhotos.set(true);
    this.api.uploadPhotos(listingId, files).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.CREATE_SUCCESS'), 'success');
        open();
      },
      error: () => {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.CREATED_PHOTOS_FAILED'), 'error');
        open();
      }
    });
  }

  onPendingPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const accepted: PendingPhoto[] = [];
    let room = PHOTO_MAX_PER_REQUEST - this.pendingPhotos().length;

    for (const file of Array.from(input.files ?? [])) {
      if (!PHOTO_ALLOWED_TYPES.includes(file.type)) {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_INVALID_TYPE', { name: file.name }), 'error');
      } else if (file.size > PHOTO_MAX_BYTES) {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_TOO_LARGE', { name: file.name }), 'error');
      } else if (room <= 0) {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_LIMIT', { max: PHOTO_MAX_PER_REQUEST }), 'error');
        break;
      } else {
        accepted.push({ file, previewUrl: URL.createObjectURL(file) });
        room--;
      }
    }

    this.pendingPhotos.update(list => [...list, ...accepted]);
    input.value = '';
  }

  removePendingPhoto(index: number): void {
    const removed = this.pendingPhotos()[index];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    this.pendingPhotos.update(list => list.filter((_, i) => i !== index));
  }

  /**
   * Defense in depth, same shape as PropertyFormPage.handleSaveError: the backend now
   * enforces the same contact-confirmation / plan-selection gates for Short-Stay listings
   * that it always enforced for Sale/Rent (see CreateShortStayListingCommandHandler), plus
   * the same plan-quota 409 conflict — Short-Stay listings now count against the same
   * shared quota. Reuses PROPERTY_FORM's translation keys/messages rather than duplicating
   * them under SHORTSTAY.FORM — the backend message and the situation are identical.
   */
  private handleCreateError(err: { status?: number; error?: { code?: string; message?: string } }): void {
    const code = err?.error?.code;

    if (err?.status === 403 && code === 'LISTING_CONTACT_NOT_CONFIRMED') {
      this.toast.show(this.translate.instant('PROPERTY_FORM.CONTACT_NOT_CONFIRMED'), 'error');
      void this.router.navigate(['/profile'], { queryParams: { reason: 'confirm-required' } });
      return;
    }

    if (err?.status === 403 && code === 'LISTING_PLAN_REQUIRED') {
      this.toast.show(this.translate.instant('PROPERTY_FORM.PLAN_REQUIRED'), 'error');
      void this.router.navigate(['/pricing'], { queryParams: { reason: 'plan-required' } });
      return;
    }

    if (err?.status === 409 && err?.error?.message) {
      // The backend's quota-conflict message is already a complete, translated Arabic
      // sentence with the owner's exact numbers (see EnsureListingQuotaAvailableAsync) —
      // there is no generic client-side equivalent worth writing instead.
      this.toast.show(err.error.message, 'error');
      return;
    }

    // 400/422: ApiErrorInterceptor has already toasted the server's actual reason (which field
    // and why) — a second generic "save failed" toast would only bury it.
    if (err?.status === 400 || err?.status === 422) return;

    this.toast.show(this.translate.instant('SHORTSTAY.FORM.SAVE_ERROR'), 'error');
  }

  saveChanges(): void {
    const id = this.listingId();
    if (!id) return;

    this.submitAttempted.set(true);
    const invalidKey = this.firstInvalidFieldKey(true);
    if (invalidKey) {
      this.rejectSubmit(invalidKey);
      return;
    }

    this.saving.set(true);

    // Security audit fix (2026-09-18): this used to hardcode governorateId/districtId/
    // neighborhoodId/poolType/poolLocation/poolIsSeasonal/poolIsHeated/depositPercentage to
    // `null` on every save, on the mistaken assumption that the backend's PUT treats a null
    // field as "leave unchanged". It does not -- this is a full-replace PUT (see
    // UpdateShortStayListingCommandHandler), so `null` here IS an explicit clear, and every
    // save was silently wiping any existing value in these fields. None of them have edit UI
    // in this MVP form yet, so they're captured on load (applyListingToForm) and echoed back
    // unchanged here instead, exactly like every other read-only-for-now field already is.
    const update$ = this.api.update(id, {
      title: this.title,
      description: this.description,
      capacity: this.capacity,
      bedrooms: this.bedrooms,
      bathrooms: this.bathrooms,
      checkInTime: toApiTime(this.checkInTime)!,
      checkOutTime: toApiTime(this.checkOutTime)!,
      selfCheckInEnabled: this.selfCheckInEnabled,
      instantBookingEnabled: this.instantBookingEnabled,
      requestBookingEnabled: this.requestBookingEnabled,
      latitude: this.latitude,
      longitude: this.longitude,
      governorateId: this.governorateId,
      districtId: this.districtId,
      neighborhoodId: this.neighborhoodId,
      city: this.city || null,
      locationVisibility: this.locationVisibility,
      poolType: this.poolType,
      poolLocation: this.poolLocation,
      poolIsSeasonal: this.poolIsSeasonal,
      poolIsHeated: this.poolIsHeated,
      cleaningFee: this.cleaningFee,
      extraGuestFee: this.extraGuestFee,
      extraBedFee: this.extraBedFee,
      allowsSmoking: this.allowsSmoking,
      allowsParties: this.allowsParties,
      allowsPets: this.allowsPets,
      quietHoursStart: toApiTime(this.quietHoursStart),
      quietHoursEnd: toApiTime(this.quietHoursEnd),
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
        error: (err: { status?: number }) => {
          this.saving.set(false);
          if (err?.status === 400 || err?.status === 422) return; // reason already shown by the interceptor
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
