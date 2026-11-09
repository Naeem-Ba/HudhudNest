import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PhotoGuideSheetComponent } from '../../../shared/ui/photo-guide/photo-guide-sheet.component';
import { catchError, forkJoin, of } from 'rxjs';

import { ShortStayListingApiService } from '../../../core/api/short-stay-listing-api.service';
import { LookupsApiService, LookupAmenity } from '../../../core/api/lookups-api.service';
import { LocationsApiService } from '../../../core/api/locations-api.service';
import { GeoPickerComponent } from '../../../shared/ui/geo/geo-picker.component';
import { GeoPickerInitial, GeoPickerValue, GeoProposal } from '../../../shared/ui/geo/geo-picker.models';
import { GeoMapSuggestion } from '../../../core/models/geo-location.model';
import { MapPickerComponent } from '../../../map-picker/map-picker.component';
import { CITY_MAPS } from '../../../map-picker/city-map.config';
import { LangCode } from '../../../core/services/language.service';
import { AuthService } from '../../../core/auth/auth.service';
import { apiErrorText } from '../../../core/api/api-error-text';
import { UnitAvailabilityPanelComponent } from '../unit-availability-panel/unit-availability-panel.component';
import { ToastService } from '../../../shared/services/toast.service';
import { LISTING_PHOTO_COMPRESSION, compressImagesForUpload } from '../../../shared/utils/image-compression';
import {
  AccommodationTypeDto,
  LocationVisibility,
  PricingRuleDto,
  SHORT_STAY_CURRENCIES,
  ShortStayListing,
  canPublishShortStay
} from '../../../core/models/short-stay.model';
import { AmenityLabelPipe } from '../../../pipes/amenity-label.pipe';
import { LocalizedNumberPipe } from '../../../shared/pipes/localized-number.pipe';

/** Same limits the backend enforces in AddShortStayListingPhotosCommandHandler. */
const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Server cap is 5,000,000 bytes (AddShortStayListingPhotosCommandHandler.MaxImageSize), not 5 MiB.
const PHOTO_MAX_BYTES = 5_000_000;
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

/**
 * Best-effort: finds the bundled city map (centre + zoom) for a governorate by its English name so
 * choosing "Aleppo" pans the picker there. Ignores case, punctuation and doubled letters
 * ("Lattakia" / "Latakia", "Deir ez-Zor" / "DEIR_EZZOR"); returns null when nothing matches.
 */
export function cityMapFor(nameEn: string): { lat: number; lng: number; zoom: number } | null {
  const collapse = (value: string): string =>
    value.toUpperCase().replace(/[^A-Z]/g, '').replace(/(.)\1+/g, '$1');
  const wanted = collapse(nameEn ?? '');
  if (!wanted) return null;

  const hit = CITY_MAPS.find(c => {
    const key = collapse(c.nameKey);
    return key === wanted || key.includes(wanted) || wanted.includes(key);
  });
  return hit ? { lat: hit.lat, lng: hit.lng, zoom: hit.zoom } : null;
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
  imports: [ LocalizedNumberPipe,CommonModule, RouterModule, FormsModule, TranslateModule, PhotoGuideSheetComponent, MapPickerComponent, GeoPickerComponent, AmenityLabelPipe, UnitAvailabilityPanelComponent],
  templateUrl: './short-stay-listing-form.page.html',
  styleUrls: ['./short-stay-listing-form.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShortStayListingFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ShortStayListingApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly locationsApi = inject(LocationsApiService);
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
  readonly amenitiesLoading = signal(false);
  readonly amenitiesLoadFailed = signal(false);
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
  /** True while picked photos are being shrunk in the browser. */
  readonly processingPhotos = signal(false);
  readonly togglingPublish = signal(false);

  // ── الموقع: المحافظة ← المنطقة ← الحي + نقطة على الخريطة ──
  readonly geoInitial = signal<GeoPickerInitial | null>(null);
  /** The pin the host has just placed or moved: this is what triggers an address suggestion. */
  readonly geoPin = signal<{ lat: number; lng: number } | null>(null);
  /** Places the host typed that the catalog lacks; proposed to the administrators once the listing exists. */
  private geoProposals: GeoProposal[] = [];
  @ViewChild(GeoPickerComponent) private geoPicker?: GeoPickerComponent;
  /** The map's pin. Single source of truth: latitude/longitude below always mirror it. */
  readonly pin = signal<{ lat: number; lng: number } | null>(null);
  readonly locating = signal(false);
  @ViewChild(MapPickerComponent) private mapPicker?: MapPickerComponent;

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
  latitude: number | null = null;
  longitude: number | null = null;
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

  loadAmenities(): void {
    this.amenitiesLoading.set(true);
    this.amenitiesLoadFailed.set(false);
    this.lookupsApi.getAmenities().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => { this.amenityCatalog.set(items); this.amenitiesLoading.set(false); },
      error: () => { this.amenityCatalog.set([]); this.amenitiesLoadFailed.set(true); this.amenitiesLoading.set(false); }
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.pendingPhotos().forEach(p => URL.revokeObjectURL(p.previewUrl)));

    const id = this.route.snapshot.paramMap.get('id');
    this.listingId.set(id);

    this.loadAmenities();

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
    this.setPin(listing.latitude, listing.longitude);
    this.city = listing.city ?? '';
    this.locationVisibility = listing.locationVisibility;
    this.governorateId = listing.governorateId;
    this.districtId = listing.districtId;
    this.neighborhoodId = listing.neighborhoodId;
    this.geoInitial.set({
      governorateId: listing.governorateId,
      districtId: listing.districtId,
      neighborhoodId: listing.neighborhoodId,
      city: listing.city
    });
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

  private get lang(): LangCode {
    return (this.translate.currentLang === 'ar' ? 'ar' : this.translate.currentLang === 'de' ? 'de' : 'en') as LangCode;
  }

  get mapLang(): LangCode {
    return this.lang;
  }

  /**
   * The location picker reports every change here. A short-stay listing stores the governorate, district and
   * neighborhood ids (plus the city text); places the host typed are proposed to the administrators after saving.
   */
  onGeoChange(value: GeoPickerValue): void {
    const governorateChanged = value.governorateId !== this.governorateId;
    this.governorateId = value.governorateId;
    this.districtId = value.districtId;
    this.neighborhoodId = value.neighborhoodId;
    this.city = value.city;
    this.geoProposals = value.proposals;

    // Only steer the map before the host has placed a pin: never move it out from under one.
    if (governorateChanged && value.governorateId && !this.pin()) {
      const city = value.governorateNameEn ? cityMapFor(value.governorateNameEn) : null;
      if (city) this.mapPicker?.updateCenter(city.lat, city.lng, city.zoom);
    }
  }

  onMapPlaceSelected(place: GeoMapSuggestion): void {
    this.geoPicker?.applyMapSuggestion(place);
  }

  /** "Location not found? Suggest adding it." Best effort after the listing exists: never blocks or fails the save. */
  private submitGeoProposals(): void {
    const proposals = this.geoProposals;
    if (!proposals.length) return;
    this.geoProposals = [];

    forkJoin(
      proposals.map(p =>
        this.locationsApi
          .submitRequest({
            type: p.type,
            parentLocationId: p.parentLocationId,
            name: p.name,
            proof: p.proof,
            latitude: p.latitude ?? this.latitude,
            longitude: p.longitude ?? this.longitude
          })
          .pipe(catchError(() => of(null)))
      )
    ).subscribe();
  }

  setPin(lat: number | null, lng: number | null): void {
    const valid = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng);
    this.latitude = valid ? lat : null;
    this.longitude = valid ? lng : null;
    this.pin.set(valid ? { lat: lat as number, lng: lng as number } : null);
  }

  onMapPinSelected(location: { lat: number; lng: number }): void {
    this.setPin(location.lat, location.lng);
    this.geoPin.set({ lat: location.lat, lng: location.lng });
  }

  /** "Use my location": a GPS fix becomes the pin; every failure says what to do next. */
  useMyLocation(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.toast.show(this.translate.instant('SHORTSTAY.FORM.GPS_UNSUPPORTED'), 'error');
      return;
    }

    this.locating.set(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        this.locating.set(false);
        this.setPin(position.coords.latitude, position.coords.longitude);
        this.geoPin.set({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      error => {
        this.locating.set(false);
        const key = error.code === 1 ? 'SHORTSTAY.FORM.GPS_DENIED' : 'SHORTSTAY.FORM.GPS_FAILED';
        this.toast.show(this.translate.instant(key), 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
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
    if (!this.governorateId) return 'SHORTSTAY.FORM.ERR_GOVERNORATE';
    if (!isNum(this.latitude) || !isNum(this.longitude)) return 'SHORTSTAY.FORM.ERR_PIN';
    if (includeFees && [this.cleaningFee, this.extraGuestFee, this.extraBedFee].some(fee => !isNum(fee) || fee < 0)) {
      return 'SHORTSTAY.FORM.ERR_FEES';
    }
    return null;
  }

  /** Toast the reason and move the user to the first offending field (highlighted via submitAttempted). */
  private rejectSubmit(messageKey: string): void {
    this.toast.show(this.translate.instant(messageKey), 'error');
    // A missing pin has no invalid <input> to focus — the inline error only renders after this
    // tick — so point at the map itself.
    const target = this.host.nativeElement.querySelector<HTMLElement>(
      messageKey === 'SHORTSTAY.FORM.ERR_PIN'
        ? '.ssf__map'
        : 'input.ng-invalid, select.ng-invalid, textarea.ng-invalid'
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
      governorateId: this.governorateId,
      districtId: this.districtId,
      neighborhoodId: this.neighborhoodId,
      locationVisibility: this.locationVisibility,
      defaultBasePricePerNight: this.defaultBasePricePerNight,
      currencyCode: this.currencyCode
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: created => {
        this.submitGeoProposals();
        this.uploadPendingPhotosThenOpen(created.id);
      },
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

  async onPendingPhotosSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';

    // Type and count are checked first so no time is spent shrinking a photo that would be refused anyway.
    const candidates: File[] = [];
    let room = PHOTO_MAX_PER_REQUEST - this.pendingPhotos().length;

    for (const file of files) {
      if (!PHOTO_ALLOWED_TYPES.includes(file.type)) {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_INVALID_TYPE', { name: file.name }), 'error');
      } else if (room <= 0) {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_LIMIT', { max: PHOTO_MAX_PER_REQUEST }), 'error');
        break;
      } else {
        candidates.push(file);
        room--;
      }
    }

    const prepared = await this.shrinkPhotos(candidates);
    const accepted: PendingPhoto[] = [];

    for (const file of prepared) {
      if (file.size > PHOTO_MAX_BYTES) {
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_TOO_LARGE', { name: file.name }), 'error');
      } else {
        accepted.push({ file, previewUrl: URL.createObjectURL(file) });
      }
    }

    this.pendingPhotos.update(list => [...list, ...accepted]);
  }

  private async shrinkPhotos(files: File[]): Promise<File[]> {
    if (files.length === 0) {
      return files;
    }

    this.processingPhotos.set(true);
    try {
      return await compressImagesForUpload(files, LISTING_PHOTO_COMPRESSION);
    } finally {
      this.processingPhotos.set(false);
    }
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
          this.submitGeoProposals();
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

  async onPhotosSelected(event: Event): Promise<void> {
    const id = this.listingId();
    const input = event.target as HTMLInputElement;
    if (!id || !input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    const prepared = (await this.shrinkPhotos(files.filter(file => PHOTO_ALLOWED_TYPES.includes(file.type) || !file.type)))
      .filter(file => {
        if (file.size > PHOTO_MAX_BYTES) {
          this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTO_TOO_LARGE', { name: file.name }), 'error');
          return false;
        }
        return true;
      });

    if (prepared.length === 0) {
      input.value = '';
      return;
    }

    this.uploadingPhotos.set(true);
    this.api.uploadPhotos(id, prepared).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.uploadingPhotos.set(false);
        input.value = '';
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTOS_SUCCESS'), 'success');
        this.loadForEdit(id);
      },
      error: () => {
        this.uploadingPhotos.set(false);
        // Cleared so the same photo can be picked again for the retry (a change event only fires on a new value).
        input.value = '';
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PHOTOS_ERROR'), 'error');
      }
    });
  }

  /** Publishing is refused (409) for a listing an administrator took down, so it is not offered. */
  canPublish(listing: ShortStayListing): boolean {
    return canPublishShortStay(listing);
  }

  togglePublish(): void {
    const id = this.listingId();
    const current = this.listing();
    if (!id || !current) return;
    if (!current.isPublished && !this.canPublish(current)) return;

    // The API refuses to publish without a city and a pin; say so in the user's language and
    // take them to the fix instead of a generic failure.
    if (!current.isPublished && (!current.city || current.latitude === null || current.longitude === null)) {
      this.toast.show(this.translate.instant('SHORTSTAY.FORM.PUBLISH_NEEDS_LOCATION'), 'error');
      this.host.nativeElement.querySelector('.ssf__location')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      return;
    }

    this.togglingPublish.set(true);
    const action$ = current.isPublished ? this.api.unpublish(id) : this.api.publish(id);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.togglingPublish.set(false);
        this.toast.show(this.translate.instant('SHORTSTAY.FORM.PUBLISH_TOGGLE_SUCCESS'), 'success');
        this.loadForEdit(id);
      },
      error: err => {
        this.togglingPublish.set(false);
        this.toast.show(apiErrorText(err) ?? this.translate.instant('SHORTSTAY.FORM.PUBLISH_TOGGLE_ERROR'), 'error');
      }
    });
  }
}
