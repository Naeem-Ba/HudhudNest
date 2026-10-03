import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';

import { PropertyApiService } from '../../core/api/property-api.service';
import {
  LookupsApiService,
  LookupAmenity,
  LookupItem,
  PropertyTypeLookup,
  StructuredLocationLookup,
  pickLocalizedName
} from '../../core/api/lookups-api.service';
import { Property, DuplicateCandidate } from '../../core/models/property.model';
import { ToastService } from '../../shared/services/toast.service';
import { MapPickerComponent } from '../../map-picker/map-picker.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LocationComboComponent } from '../../shared/ui/location-combo.component';
import { LanguageService, LangCode } from '../../core/services/language.service';
import { EnumItem, EnumService } from '../../core/services/enum.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';
import { LISTING_PHOTO_COMPRESSION, compressImagesForUpload } from '../../shared/utils/image-compression';
import { PhotoGuideSheetComponent } from '../../shared/ui/photo-guide/photo-guide-sheet.component';
import { PhotoGuideKind, photoGuideKindForListingType } from '../../shared/ui/photo-guide/photo-guide.data';

interface PropertySavePayload {
  Title: string;
  Description: string;
  ListingType: number;
  Street: string;
  City: string;
  Region?: string | null;
  CountryCode: string;
  PostalCode?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  ColdRent?: number | null;
  WarmRent?: number | null;
  PurchasePrice?: number | null;
  Deposit?: number | null;
  AdditionalCosts?: number | null;
  CurrencyCode: string;
  Rooms?: number | null;
  Area?: number | null;
  Floor?: number | null;
  HasBalcony: boolean;
  HasElevator: boolean;
  HasParkingSpace: boolean;
  HeatingType?: number;
  AvailableFrom?: string | null;
  AmenityIds?: string[];
  // Phase-0, Task 0.
  GovernorateId?: number | null;
  DistrictId?: number | null;
  DistrictText?: string | null;
  NeighborhoodId?: number | null;
  NeighborhoodText?: string | null;
  PropertyTypeId?: number | null;
  // Dynamic listing form (ListingType × PropertyType redesign, Syrian
  // market) — see CreatePropertyCommand on the backend for the same fields.
  LegalStatus?: number | null;
  AreaUnit: number;
  RentalStartDate?: string | null;
  RentalEndDate?: string | null;
  RentalDurationType?: number | null;
  FurnishingStatus?: number | null;
}

/** AreaUnit — must match HudhudNestApi.Domain.Listings.Enums.AreaUnit's ordinals. */
const AREA_UNIT_SQUARE_METER = 0;

/** RentalDurationType — must match HudhudNestApi.Domain.Listings.Enums.RentalDurationType's ordinals. */
const RENTAL_DURATION_SIX_MONTHS = 0;
const RENTAL_DURATION_ONE_YEAR = 1;

const VALID_COUNTRY_CODES = new Set(['DE', 'SY', 'US', 'GB', 'FR', 'AE', 'SA', 'TR', 'EG', 'JO', 'LB']);
const VALID_CURRENCY_CODES = new Set(['EUR', 'USD', 'GBP', 'SYP', 'TRY', 'AED', 'SAR', 'EGP', 'JOD', 'LBP']);

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

/**
 * Adds `months` to a 'YYYY-MM-DD' date-input string, returning the same format.
 * Deliberately does all arithmetic in UTC via Date.UTC/getUTCFullYear etc.,
 * never `new Date(dateString)` + local setMonth(): a plain 'YYYY-MM-DD' string
 * parses as UTC midnight, but the local-time getters/setters (getMonth,
 * setMonth) read/write the browser's local calendar date — off by a day in
 * every timezone west of UTC (e.g. '2026-01-01' + 6 months silently becoming
 * '2026-06-30' for a user west of Greenwich).
 * Returns null for anything that is not a complete 'YYYY-MM-DD' (toISOString() would
 * throw a RangeError on the resulting Invalid Date).
 */
export function addMonthsToDateString(dateString: string, months: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1 + months, day));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function positiveNumber(control: AbstractControl): ValidationErrors | null {
  const value = toNumberOrNull(control.value);
  return value === null || value > 0 ? null : { positiveNumber: true };
}

function nonNegativeNumber(control: AbstractControl): ValidationErrors | null {
  const value = toNumberOrNull(control.value);
  return value === null || value >= 0 ? null : { nonNegativeNumber: true };
}

/**
 * >10 only makes sense in square meters — a 2-Dunum plot (≈2000 m²) is a
 * perfectly normal, small-looking number in its own unit. Reads the sibling
 * areaUnit control via control.parent since this validator sits on `area`
 * alone — mirrors the same split rule on the backend
 * (CreatePropertyCommandValidator).
 */
function areaGreaterThanTen(control: AbstractControl): ValidationErrors | null {
  const value = toNumberOrNull(control.value);
  if (value === null) return null;

  const unit = Number(control.parent?.get('areaUnit')?.value ?? AREA_UNIT_SQUARE_METER);
  const threshold = unit === AREA_UNIT_SQUARE_METER ? 10 : 0;

  return value > threshold ? null : { areaGreaterThanTen: true };
}

function propertyFormValidator(group: AbstractControl): ValidationErrors | null {
  const listingType = Number(group.get('listingType')?.value);
  const coldRent = toNumberOrNull(group.get('coldRent')?.value);
  const warmRent = toNumberOrNull(group.get('warmRent')?.value);
  const purchasePrice = toNumberOrNull(group.get('purchasePrice')?.value);
  const countryCode = String(group.get('countryCode')?.value ?? '').trim().toUpperCase();
  const currencyCode = String(group.get('currencyCode')?.value ?? '').trim().toUpperCase();

  const errors: ValidationErrors = {};

  if (!VALID_COUNTRY_CODES.has(countryCode)) {
    errors['invalidCountryCode'] = true;
  }

  if (!VALID_CURRENCY_CODES.has(currencyCode)) {
    errors['invalidCurrencyCode'] = true;
  }

  if (listingType === 1 && (coldRent === null || coldRent <= 0)) {
    errors['coldRentRequired'] = true;
  }

  if (listingType === 2 && (purchasePrice === null || purchasePrice <= 0)) {
    errors['purchasePriceRequired'] = true;
  }

  if (warmRent !== null && coldRent !== null && warmRent < coldRent) {
    errors['warmRentBelowColdRent'] = true;
  }

  // District: pick one from the list OR type its name manually (submitted as
  // an admin-reviewed LocationSuggestion — see districtText's control doc
  // comment). At least one must be present.
  const districtId = group.get('districtId')?.value;
  const districtText = String(group.get('districtText')?.value ?? '').trim();
  if (!districtId && !districtText) {
    errors['districtRequired'] = true;
  }

  return Object.keys(errors).length ? errors : null;
}

@Component({
  selector: 'app-property-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterLink,
    MapPickerComponent,
    ImageFallbackDirective,
    LocationComboComponent,
    PhotoGuideSheetComponent
  ],
  templateUrl: './property-form.page.html',
  styleUrls: ['./property-form.page.scss']
})
export class PropertyFormPage implements OnInit {
  private readonly propertyApi = inject(PropertyApiService);
  private readonly lookupsApi = inject(LookupsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly langService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly enumService = inject(EnumService);
  private readonly scrollLock = inject(ScrollLockService);

  readonly isSaving = signal(false);
  /** Photography guide (UX only): never part of the form value nor of the upload flow. */
  readonly photoGuideOpen = signal(false);
  readonly isEditMode = signal(false);
  readonly propertyId = signal('');
  readonly currentLang = signal<LangCode>('ar');
  readonly submitError = signal('');

  readonly selectedFiles = signal<File[]>([]);
  readonly previews = signal<string[]>([]);
  readonly existingImages = signal<{ id?: string; url: string; isMain: boolean }[]>([]);
  readonly imageActionBusyId = signal<string | null>(null);
  readonly fallbackImage = '/images/no-image.svg';
  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  readonly maxSizeMB = 5;
  /** Matches UploadPropertyImagesCommandHandler.MaxImageSize (decimal 5 MB, not 5 MiB). */
  private readonly maxUploadBytes = 5_000_000;
  /** True while picked photos are being shrunk in the browser (see image-compression.ts). */
  readonly processingPhotos = signal(false);

  /**
   * ✅ إضافة: قائمة المرافق (GET /api/lookups/amenities) والمدن المقترحة
   * (GET /api/lookups/cities) — لم تكونا مستخدَمتين إطلاقاً من قبل، وحقل
   * AmenityIds كان موجوداً في الـ payload دون أي واجهة لاختياره أو حتى
   * إرساله فعلياً مع الطلب.
   */
  readonly amenities = signal<LookupAmenity[]>([]);
  readonly amenitiesLoadFailed = signal(false);
  readonly selectedAmenityIds = signal<Set<string>>(new Set());
  readonly citySuggestions = signal<LookupItem[]>([]);

  /**
   * Structured location + property-type dropdowns.
   * Cascading: governorate -> district -> neighborhood, each list loaded only
   * once its parent is chosen.
   *
   * ✅ تحديث: أصبحت المحافظة والمنطقة ونوع العقار إجبارية بدل النصوص الحرة
   * (city/region) التي كانت تُعرض سابقاً — تلك الحقول ما زالت موجودة داخلياً
   * بالنموذج (الباك اند لا يزال يتطلب City) لكنها الآن تُشتق تلقائياً من
   * القوائم المختارة بدل أن يكتبها المستخدم. الحي وحده يبقى اختيارياً لأن
   * بيانات الأحياء موثّقة فقط لدمشق وحمص واللاذقية حالياً — عند غيابها يمكن
   * كتابة اسم الحي يدوياً عبر neighborhoodText.
   */
  readonly governorates = signal<StructuredLocationLookup[]>([]);
  readonly districts = signal<StructuredLocationLookup[]>([]);
  readonly neighborhoods = signal<StructuredLocationLookup[]>([]);
  readonly propertyTypeCatalog = signal<PropertyTypeLookup[]>([]);
  readonly structuredLocationLoadFailed = signal(false);

  /** Phase-0, Task 4 — advisory duplicate-listing check, shown before final submit. */
  readonly duplicateCandidates = signal<DuplicateCandidate[]>([]);
  readonly showDuplicateWarning = signal(false);
  readonly checkingDuplicate = signal(false);
  /** Set once the user explicitly chooses "submit anyway" from the duplicate warning. */
  private duplicateCheckAcknowledged = false;

  /**
   * Dynamic listing form (ListingType × PropertyType redesign, Syrian market).
   * Category ('Residential'/'Land'/'Commercial') of the currently selected
   * propertyTypeId — resolved from propertyTypeCatalog(), which is already
   * fetched for the property-type <select>. Drives which sections/fields show
   * (Land hides rooms/floor/features, shows areaUnit) and feeds
   * conditionalFieldsValidator below. Kept as a signal rather than a computed()
   * because it also needs to run a one-time side effect (clearing
   * now-inapplicable field values) the moment a selection turns into Land.
   */
  readonly selectedCategory = signal<string | null>(null);

  /** Enum-backed dropdown options, loaded once (EnumService caches app-wide). */
  readonly ownershipTypeOptions = signal<EnumItem[]>(this.enumService.getList('OwnershipType'));
  readonly areaUnitOptions = signal<EnumItem[]>(this.enumService.getList('AreaUnit'));
  readonly furnishingStatusOptions = signal<EnumItem[]>(this.enumService.getList('FurnishingStatus'));
  /** True when the enum-backed dropdowns could not be loaded even after a retry. */
  readonly enumOptionsLoadFailed = signal(false);

  /**
   * Cross-field validation for the fields that depend on ListingType/PropertyType
   * category rather than on a single control — same idea as propertyFormValidator
   * below, kept as a separate class-bound validator (instead of folding into that
   * module-level function) purely because it needs `this.selectedCategory()`.
   * Declared as a field (not a method) so it can be referenced by `form`'s
   * initializer just below without an explicit .bind(this).
   */
  private readonly conditionalFieldsValidator = (group: AbstractControl): ValidationErrors | null => {
    const listingType = Number(group.get('listingType')?.value);
    const isRent = listingType === 1;
    const isSale = listingType === 2;
    const isLand = this.selectedCategory() === 'Land';

    const errors: ValidationErrors = {};

    if (isSale) {
      const ownershipType = group.get('ownershipType')?.value;
      if (ownershipType === null || ownershipType === undefined || ownershipType === '') {
        errors['ownershipTypeRequired'] = true;
      }
    }

    if (isRent) {
      const start = group.get('rentalStartDate')?.value;
      const end = group.get('rentalEndDate')?.value;
      const duration = group.get('rentalDurationType')?.value;

      if (!start) errors['rentalStartDateRequired'] = true;
      if (!end) errors['rentalEndDateRequired'] = true;
      if (duration === null || duration === undefined || duration === '') {
        errors['rentalDurationRequired'] = true;
      }

      if (start && end && new Date(end) <= new Date(start)) {
        errors['rentalEndBeforeStart'] = true;
      }
    }

    if (isLand) {
      const area = toNumberOrNull(group.get('area')?.value);
      if (area === null) {
        errors['areaRequiredForLand'] = true;
      }
    }

    return Object.keys(errors).length ? errors : null;
  };

  readonly form = this.fb.group({
    listingType: [1, Validators.required],
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
    street: ['', [Validators.required, Validators.maxLength(300)]],
    // city/region: no longer user-facing (see the class-level doc comment
    // above governorates()) — kept required internally and auto-derived from
    // the governorate/district selects in bindCascadingLocationChanges(),
    // since the backend still stores them as its City/Region free-text
    // columns for legacy compatibility and search indexing.
    city: ['', [Validators.required, Validators.maxLength(150)]],
    region: [null as string | null, Validators.maxLength(150)],
    postalCode: [null as string | null, Validators.maxLength(20)],
    countryCode: ['SY', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    // Governorate/PropertyType are strict required dropdowns (full, verified
    // catalogs). District is required too, but can be satisfied either by
    // districtId (picked from the list) OR districtText (typed manually when
    // not listed — enforced by the cross-field 'districtRequired' error in
    // propertyFormValidator, not a plain Validators.required here).
    // Neighborhood stays fully optional either way (seed coverage gap — see
    // the class doc comment). Both *Text fields auto-submit an admin-reviewed
    // LocationSuggestion — see property.model.ts's doc comments.
    governorateId: [null as number | null, Validators.required],
    districtId: [null as number | null],
    districtText: [null as string | null, Validators.maxLength(150)],
    neighborhoodId: [null as number | null],
    neighborhoodText: [null as string | null, Validators.maxLength(150)],
    propertyTypeId: [null as number | null, Validators.required],
    latitude: [null as number | null, [Validators.min(-90), Validators.max(90)]],
    longitude: [null as number | null, [Validators.min(-180), Validators.max(180)]],
    currencyCode: ['SYP', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
    coldRent: [null as number | null, positiveNumber],
    warmRent: [null as number | null, positiveNumber],
    purchasePrice: [null as number | null, positiveNumber],
    deposit: [null as number | null, nonNegativeNumber],
    additionalCosts: [null as number | null, nonNegativeNumber],
    rooms: [null as number | null, [Validators.min(1), Validators.max(50)]],
    area: [null as number | null, areaGreaterThanTen],
    areaUnit: [AREA_UNIT_SQUARE_METER, Validators.required],
    floor: [null as number | null, Validators.min(0)],
    availableFrom: [null as string | null],
    heatingType: [0],
    hasBalcony: [false],
    hasElevator: [false],
    hasParkingSpace: [false],
    // Dynamic listing form (ListingType × PropertyType redesign, Syrian
    // market). Required-ness is context-dependent (Sale → ownershipType,
    // Rent → the three rental fields, Land → area) — enforced by
    // conditionalFieldsValidator above, not by plain Validators.required
    // here, the same pattern already used for districtId/districtText.
    ownershipType: [null as number | null],
    rentalStartDate: [null as string | null],
    rentalEndDate: [null as string | null],
    rentalDurationType: [null as number | null],
    // Furnished/unfurnished — optional, hidden for Land (see selectedCategory).
    furnishingStatus: [null as number | null]
  }, { validators: [propertyFormValidator, this.conditionalFieldsValidator] });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';

    if (id) {
      this.isEditMode.set(true);
      this.propertyId.set(id);
    }

    // Enum options are (re)loaded here rather than trusted from the startup preload; edit
    // mode waits for them so enumIdByKey can map the saved ownership/furnishing/area unit
    // (otherwise an edit-then-save would send null and clear those values).
    const enumsReady = this.loadEnumOptions();
    if (id) {
      void enumsReady.then(() => this.loadExistingProperty(id));
    }

    this.bindLanguage();
    this.loadAmenities();
    this.loadGovernorates();
    this.loadPropertyTypeCatalog();
    this.bindCascadingLocationChanges();
    this.bindPropertyTypeCategoryTracking();
    this.bindRentalDurationAutoFill();

    // شبكة أمان: لو انهدم المكوّن وكان تحذير التكرار مفتوحًا (تنقّل بعيدًا
    // أثناء ظهور الـ Dialog)، لا يجب أن يبقى قفل التمرير عالقًا على التطبيق.
    this.destroyRef.onDestroy(() => {
      this.scrollLock.forceUnlockIfHeldBy(this.showDuplicateWarning());
    });
  }

  /** GET /api/lookups/governorates — Phase-0, Task 0 follow-up. */
  private loadGovernorates(): void {
    this.lookupsApi
      .getGovernorates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.governorates.set(items),
        error: () => this.structuredLocationLoadFailed.set(true)
      });
  }

  /** GET /api/lookups/property-type-catalog — Phase-0, Task 0 follow-up. */
  private loadPropertyTypeCatalog(): void {
    this.lookupsApi
      .getPropertyTypeCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          this.propertyTypeCatalog.set(items);
          // Covers the "existing property already loaded before the catalog
          // did" ordering — recompute now that categories are available.
          this.updateSelectedCategory(this.form.controls.propertyTypeId.value);
        },
        error: () => this.structuredLocationLoadFailed.set(true)
      });
  }

  /**
   * Tracks which PropertyType.Category ('Residential'/'Land'/'Commercial') is
   * currently selected, driving conditional rendering/validation. Covers the
   * "catalog already loaded, user picks/changes a type" ordering — see
   * loadPropertyTypeCatalog() above for the reverse ordering.
   */
  private bindPropertyTypeCategoryTracking(): void {
    this.form.controls.propertyTypeId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(propertyTypeId => this.updateSelectedCategory(propertyTypeId));
  }

  private updateSelectedCategory(propertyTypeId: number | null): void {
    const match = this.propertyTypeCatalog().find(pt => pt.id === propertyTypeId);
    const category = match?.category ?? null;
    const becameLand = category === 'Land' && this.selectedCategory() !== 'Land';

    this.selectedCategory.set(category);

    if (becameLand) {
      this.clearFieldsNotApplicableToLand();
    }

    this.form.updateValueAndValidity();
  }

  /**
   * §13 of the task brief: switching to a PropertyType whose category is Land
   * must not leave stale, inapplicable values (e.g. Rooms=3) sitting in the
   * form ready to be submitted. Mirrors setListingType()'s existing cleanup
   * of price fields on Rent↔Sale.
   */
  private clearFieldsNotApplicableToLand(): void {
    this.form.patchValue({
      rooms: null,
      floor: null,
      hasBalcony: false,
      hasElevator: false,
      hasParkingSpace: false,
      furnishingStatus: null
    });
  }

  /**
   * Rental duration auto-fill: SixMonths/OneYear compute rentalEndDate from
   * rentalStartDate (disabled for manual edit in the template — see
   * isCustomRentalDuration); Custom leaves rentalEndDate fully manual. This is
   * a frontend UX convenience only — the backend does not enforce that the gap
   * matches the chosen duration exactly, only that end > start.
   */
  private bindRentalDurationAutoFill(): void {
    const recompute = (): void => {
      const duration = this.form.controls.rentalDurationType.value;
      const start = this.form.controls.rentalStartDate.value;
      if (!start) return;

      const months = duration === RENTAL_DURATION_SIX_MONTHS ? 6
        : duration === RENTAL_DURATION_ONE_YEAR ? 12
          : null;
      const end = months === null ? null : addMonthsToDateString(start, months);
      if (end) {
        this.form.patchValue({ rentalEndDate: end }, { emitEvent: false });
      }
      // Custom: rentalEndDate stays exactly what the user typed.
    };

    this.form.controls.rentalDurationType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(recompute);

    this.form.controls.rentalStartDate.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(recompute);
  }

  /** True once the user has picked "Custom" duration — enables manual rentalEndDate entry. */
  get isCustomRentalDuration(): boolean {
    return this.form.value.rentalDurationType === 2; // RentalDurationType.Custom
  }

  get isLandCategory(): boolean {
    return this.selectedCategory() === 'Land';
  }

  /**
   * Cascading dropdowns: choosing a governorate loads its districts and clears
   * whatever district/neighborhood was previously selected (they'd belong to
   * the old governorate); choosing a district loads its neighborhoods and
   * clears the previously-selected neighborhood the same way. Skipped during
   * the initial patch from loadExistingProperty (see the `emitEvent: false`
   * there) so editing a property doesn't wipe its own saved selections.
   */
  private bindCascadingLocationChanges(): void {
    this.form.controls.governorateId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(governorateId => {
        this.districts.set([]);
        this.neighborhoods.set([]);
        this.form.patchValue({ districtId: null, neighborhoodId: null }, { emitEvent: false });

        // ✅ city (required by the backend) is derived from the chosen
        // governorate's name instead of being typed — see the class doc
        // comment. Falls back to '' when cleared, which correctly re-fails
        // Validators.required on city until a governorate is picked again.
        const governorate = this.governorates().find(g => g.id === governorateId);
        this.form.patchValue({ city: governorate ? this.localizedName(governorate) : '' });

        if (governorateId) {
          this.loadDistricts(governorateId);
        }
      });

    this.form.controls.districtId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(districtId => {
        this.neighborhoods.set([]);
        this.form.patchValue({ neighborhoodId: null }, { emitEvent: false });

        // ✅ region derived from the chosen district's name, same reasoning
        // as city above.
        const district = this.districts().find(d => d.id === districtId);
        this.form.patchValue({ region: district ? this.localizedName(district) : null });

        if (districtId) {
          this.loadNeighborhoods(districtId);
        }
      });

    // Neighborhood dropdown and manual free-text entry are mutually
    // exclusive in intent (see Property.NeighborhoodText's backend doc
    // comment) — picking one clears the other so we never submit a stale
    // value from whichever the user isn't currently using.
    this.form.controls.neighborhoodId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(neighborhoodId => {
        if (neighborhoodId) {
          this.form.patchValue({ neighborhoodText: null }, { emitEvent: false });
        }
      });

    this.form.controls.neighborhoodText.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(text => {
        if (text && text.trim() && this.form.controls.neighborhoodId.value) {
          this.form.patchValue({ neighborhoodId: null }, { emitEvent: false });
          this.neighborhoods.set([]);
        }
      });

    // Same mutual-exclusivity pattern for district: picking from the list
    // clears any manually-typed name, and typing a name clears the picked
    // district (and its now-inapplicable neighborhood selection/list, since
    // there's no real districtId left to load neighborhoods for).
    this.form.controls.districtId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(districtId => {
        if (districtId) {
          this.form.patchValue({ districtText: null }, { emitEvent: false });
        }
      });

    this.form.controls.districtText.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(text => {
        if (text && text.trim() && this.form.controls.districtId.value) {
          this.form.patchValue({ districtId: null, neighborhoodId: null }, { emitEvent: false });
          this.districts.set([]);
          this.neighborhoods.set([]);
        }
      });
  }

  private loadDistricts(governorateId: number): void {
    this.lookupsApi
      .getDistricts(governorateId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.districts.set(items),
        error: () => this.districts.set([])
      });
  }

  private loadNeighborhoods(districtId: number): void {
    this.lookupsApi
      .getNeighborhoods(districtId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.neighborhoods.set(items),
        error: () => this.neighborhoods.set([])
      });
  }

  /** Localized label for a bilingual lookup item, matching the current UI language. */
  localizedName(item: { nameAr: string; nameEn: string }): string {
    return pickLocalizedName(item, this.currentLang());
  }

  /**
   * Resolves the numeric enum id the create/update commands expect from the
   * enum-name STRING a PropertyDto response carries (e.g. "GreenDeed") — via
   * the same cached /api/enums/{group} list the <select> options come from,
   * so this never hardcodes an ordinal that could drift from the backend.
   */
  private async loadEnumOptions(): Promise<void> {
    await this.enumService.ensureLoaded([
      'OwnershipType', 'AreaUnit', 'FurnishingStatus', 'RentalDurationType', 'HeatingType'
    ]);

    this.ownershipTypeOptions.set(this.enumService.getList('OwnershipType'));
    this.areaUnitOptions.set(this.enumService.getList('AreaUnit'));
    this.furnishingStatusOptions.set(this.enumService.getList('FurnishingStatus'));
    this.enumOptionsLoadFailed.set(
      this.ownershipTypeOptions().length === 0 || this.furnishingStatusOptions().length === 0
    );
  }

  /**
   * Create always sends the chosen value. Edit sends it only when the user changed it: the update
   * command treats an omitted HeatingType as "keep", whereas sending the untouched default (0 = Unknown)
   * silently overwrote the stored value — including when this app runs against an API that does not
   * return the saved heating type yet.
   */
  heatingTypeForSave(): number | undefined {
    const control = this.form.controls.heatingType;
    if (this.isEditMode() && !control.dirty) return undefined;
    return control.value ?? 0;
  }

  /** PropertyDto returns the enum NAME ("Gas"); older payloads may already carry the number. */
  private heatingTypeId(value: number | string | null | undefined): number {
    if (typeof value === 'number') return value;
    return this.enumIdByKey('HeatingType', value) ?? 0;
  }

  private enumIdByKey(group: string, key: string | null | undefined): number | null {
    if (!key) return null;
    const match = this.enumService.getList(group).find(item => item.Key === key);
    return match ? Number(match.Id) : null;
  }

  /** GET /api/lookups/amenities — كانت غير مستخدمة إطلاقاً في الواجهة. */
  private loadAmenities(): void {
    this.lookupsApi
      .getAmenities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: amenities => this.amenities.set(amenities),
        error: () => this.amenitiesLoadFailed.set(true)
      });
  }

  /**
   * GET /api/lookups/cities — تُستخدم فقط كاقتراحات (datalist) لحقل المدينة
   * النصي الحالي، دون تقييد المستخدم بقيمة من القائمة (قد يكتب مدينة جديدة
   * غير موجودة بعد ضمن أي عقار).
   */
  private loadCitySuggestions(): void {
    this.lookupsApi
      .getCities()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: cities => this.citySuggestions.set(cities),
        error: () => this.citySuggestions.set([])
      });
  }

  isAmenitySelected(amenityId: string): boolean {
    return this.selectedAmenityIds().has(amenityId);
  }

  toggleAmenity(amenityId: string): void {
    this.selectedAmenityIds.update(current => {
      const next = new Set(current);
      if (next.has(amenityId)) {
        next.delete(amenityId);
      } else {
        next.add(amenityId);
      }
      return next;
    });
  }

  private bindLanguage(): void {
    const service = this.langService as unknown as {
      currentLang$?: Observable<LangCode>;
      getCurrentLang?: () => LangCode;
    };

    if (service.getCurrentLang) {
      this.currentLang.set(service.getCurrentLang());
    }

    service.currentLang$
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(lang => this.currentLang.set(lang));
  }

  private loadExistingProperty(id: string): void {
    // ✅ إصلاح: كانت هذه الدالة تستخدم GET /properties/{id} العام، الذي يرفض
    // بـ 404 أي عقار غير منشور بعد (Draft) حتى لصاحبه — ما كان يمنع فتح نموذج
    // التعديل لعقار لم يُنشَر. الآن تستخدم GET /properties/{id}/manage المخصصة
    // (نفس شكل البيانات تماماً)، والتي تُرجع العقار لصاحبه أو للأدمن بغض النظر
    // عن حالة النشر، وتتحقق من الملكية صراحة على الخادم (403 لغير المُخوَّل).
    this.propertyApi
      .getPropertyForManagement(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (property: Property) => {
          this.form.patchValue({
            listingType: property.listingType === 'ForSale' || property.listingType === 2 ? 2 : 1,
            title: property.title ?? '',
            description: property.description ?? '',
            street: property.street ?? '',
            city: property.city ?? '',
            region: property.region ?? null,
            postalCode: property.postalCode ?? null,
            countryCode: property.countryCode ?? 'SY',
            latitude: property.latitude ?? null,
            longitude: property.longitude ?? null,
            currencyCode: property.currencyCode ?? 'SYP',
            coldRent: property.coldRent ?? null,
            warmRent: property.warmRent ?? null,
            purchasePrice: property.purchasePrice ?? null,
            deposit: property.deposit ?? null,
            additionalCosts: property.additionalCosts ?? null,
            rooms: property.rooms ?? null,
            area: property.area ?? null,
            floor: property.floor ?? null,
            hasBalcony: property.hasBalcony ?? false,
            hasElevator: property.hasElevator ?? false,
            hasParkingSpace: property.hasParkingSpace ?? false,
            propertyTypeId: property.propertyTypeId ?? null,
            // Dynamic listing form (ListingType × PropertyType redesign).
            // PropertyDto returns these as enum-name STRINGS (e.g. "GreenDeed"),
            // while the create/update commands expect the numeric ordinal (same
            // asymmetry already handled above for listingType) — resolved via
            // the cached EnumService list rather than hardcoding ordinals here.
            areaUnit: this.enumIdByKey('AreaUnit', property.areaUnit) ?? AREA_UNIT_SQUARE_METER,
            rentalStartDate: property.rentalStartDate ?? null,
            rentalEndDate: property.rentalEndDate ?? null,
            rentalDurationType: this.enumIdByKey('RentalDurationType', property.rentalDurationType),
            ownershipType: this.enumIdByKey('OwnershipType', property.legalStatus),
            furnishingStatus: this.enumIdByKey('FurnishingStatus', property.furnishingStatus),
            // The control used to keep its default (0 = Unknown) in edit mode, so saving any
            // edit silently overwrote the stored heating type.
            heatingType: this.heatingTypeId(property.heatingType)
          });

          // Phase-0, Task 0 follow-up: patched with emitEvent:false so the
          // governorateId/districtId valueChanges cascade above (which clears
          // child selections on change) doesn't wipe the very values we're
          // restoring here. District/neighborhood options for the saved
          // governorate/district are then loaded explicitly below instead.
          this.form.patchValue({
            governorateId: property.governorateId ?? null,
            districtId: property.districtId ?? null,
            districtText: property.districtText ?? null,
            neighborhoodId: property.neighborhoodId ?? null,
            neighborhoodText: property.neighborhoodText ?? null
          }, { emitEvent: false });

          if (property.governorateId) {
            this.lookupsApi.getDistricts(property.governorateId)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({ next: items => this.districts.set(items), error: () => this.districts.set([]) });
          }

          if (property.districtId) {
            this.lookupsApi.getNeighborhoods(property.districtId)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({ next: items => this.neighborhoods.set(items), error: () => this.neighborhoods.set([]) });
          }

          // ✅ الصور المحفوظة فعلياً تُعرض وتُدار بشكل منفصل عن معاينات الرفع
          // الجديدة، لأن لها id على الخادم ويمكن حذفها/تعيينها كغلاف فردياً
          // (setmain/delete)، بخلاف الملفات المُختارة للتو التي لم تُحفظ بعد.
          const existing = (property.images ?? [])
            .filter(image => !!image.url)
            .map(image => ({ id: image.id, url: image.url, isMain: !!image.isMain }));
          this.existingImages.set(existing);

          // ✅ إضافة: تعليم المرافق المحفوظة مسبقاً للعقار كمُحدَّدة في واجهة
          // التعديل (بدلاً من فقدانها لأنه لم تكن هناك واجهة لعرضها أصلاً).
          const existingAmenityIds = (property.amenities ?? [])
            .map(amenity => amenity.id)
            .filter((id): id is string => !!id);
          this.selectedAmenityIds.set(new Set(existingAmenityIds));
        },
        // ✅ إضافة: رسالة أوضح عند 403 (محاولة تعديل عقار مستخدم آخر) بدل رسالة
        // "تعذر التحميل" العامة المضلِّلة.
        error: (err: { status?: number }) =>
          this.submitError.set(
            err?.status === 403 ? 'PROPERTY_FORM.NOT_AUTHORIZED' : 'PROPERTY_FORM.LOAD_ERROR'
          )
      });
  }

  onLocationSelected(location: { lat: number; lng: number }): void {
    this.form.patchValue({ latitude: location.lat, longitude: location.lng });
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // The File objects stay valid after the input is cleared, and clearing now lets the user pick the same photo again.
    input.value = '';

    const typed: File[] = [];

    for (const file of files) {
      if (!this.allowedTypes.includes(file.type)) {
        this.showToast(this.translate.instant('PROPERTY_FORM.INVALID_FILE_TYPE'), 'error');
        continue;
      }

      typed.push(file);
    }

    // Camera photos routinely exceed the server's 5 MB cap; shrink them here instead of rejecting them.
    this.processingPhotos.set(true);
    let prepared: File[];
    try {
      prepared = await compressImagesForUpload(typed, LISTING_PHOTO_COMPRESSION);
    } finally {
      this.processingPhotos.set(false);
    }

    const valid: File[] = [];

    for (const file of prepared) {
      if (file.size > this.maxUploadBytes) {
        this.showToast(this.translate.instant('PROPERTY_FORM.FILE_TOO_LARGE', { name: file.name }), 'error');
        continue;
      }

      valid.push(file);
    }

    this.selectedFiles.update(prev => [...prev, ...valid]);

    for (const file of valid) {
      const reader = new FileReader();
      reader.onload = e => {
        this.previews.update(prev => [...prev, e.target?.result as string]);
      };
      reader.readAsDataURL(file);
    }
  }

  removeImage(index: number): void {
    this.previews.update(prev => prev.filter((_, i) => i !== index));
    this.selectedFiles.update(prev => prev.filter((_, i) => i !== index));
  }

  /**
   * إدارة الصور المحفوظة فعلياً على الخادم (وليست معاينات رفع جديدة).
   * تستخدم PropertyImagesController: PATCH .../setmain و DELETE .../{imageId}
   * وهما لم يكونا مستخدَمين إطلاقاً في الواجهة قبل هذا التعديل.
   */
  setMainImage(imageId: string | undefined): void {
    if (!imageId || !this.propertyId() || this.imageActionBusyId()) return;

    this.imageActionBusyId.set(imageId);

    this.propertyApi
      .setMainImage(this.propertyId(), imageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.existingImages.update(images =>
            images.map(img => ({ ...img, isMain: img.id === imageId }))
          );
          this.imageActionBusyId.set(null);
        },
        error: () => {
          this.showToast(this.translate.instant('PROPERTY_FORM.SET_MAIN_ERROR'), 'error');
          this.imageActionBusyId.set(null);
        }
      });
  }

  deleteExistingImage(imageId: string | undefined): void {
    if (!imageId || !this.propertyId() || this.imageActionBusyId()) return;

    const confirmed = confirm(this.translate.instant('PROPERTY_FORM.CONFIRM_DELETE_IMAGE'));
    if (!confirmed) return;

    this.imageActionBusyId.set(imageId);

    this.propertyApi
      .deleteImage(this.propertyId(), imageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.existingImages.update(images => images.filter(img => img.id !== imageId));
          this.imageActionBusyId.set(null);
        },
        error: () => {
          this.showToast(this.translate.instant('PROPERTY_FORM.DELETE_IMAGE_ERROR'), 'error');
          this.imageActionBusyId.set(null);
        }
      });
  }

  /** Rent (1) / sale (2) decides which shots the photography guide leads with. */
  get photoGuideKind(): PhotoGuideKind {
    return photoGuideKindForListingType(this.form.get('listingType')?.value);
  }

  setListingType(type: 1 | 2): void {
    this.form.patchValue({ listingType: type });

    if (type === 1) {
      // Rent: sale-only fields don't apply.
      this.form.patchValue({ purchasePrice: null, ownershipType: null });
    } else {
      // Sale: rent-only fields (including rental term) don't apply.
      this.form.patchValue({
        coldRent: null,
        warmRent: null,
        additionalCosts: null,
        rentalStartDate: null,
        rentalEndDate: null,
        rentalDurationType: null
      });
    }

    this.form.updateValueAndValidity();
  }

  onSubmit(): void {
    this.submitError.set('');
    this.normalizeCodes();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.submitError.set(this.firstValidationError());
      return;
    }

    // Phase-0, Task 4: advisory duplicate check, create-mode only (editing an
    // existing listing can't be "a duplicate of itself"). Skipped once the
    // user has explicitly acknowledged the warning and chosen to proceed.
    const f = this.form.getRawValue();

    if (!this.isEditMode() && !this.duplicateCheckAcknowledged && f.neighborhoodId) {
      this.runDuplicateCheckThenSubmit();
      return;
    }

    this.proceedWithSubmit();
  }

  /**
   * GET /properties/check-duplicate before the real submit. Advisory only —
   * a failed check (network error, etc.) must never block a legitimate
   * submission, so any error here just falls through to proceedWithSubmit()
   * instead of surfacing as a save error.
   */
  private runDuplicateCheckThenSubmit(): void {
    const f = this.form.getRawValue();
    const price = f.listingType === 2 ? f.purchasePrice : f.coldRent;

    this.checkingDuplicate.set(true);

    this.propertyApi
      .checkDuplicate({
        neighborhoodId: f.neighborhoodId ?? null,
        area: f.area ?? null,
        price: price ?? null,
        listingType: f.listingType!
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.checkingDuplicate.set(false);

          if (result.hasPotentialDuplicates) {
            this.duplicateCandidates.set(result.candidates);
            this.setShowDuplicateWarning(true);
            return;
          }

          this.proceedWithSubmit();
        },
        error: () => {
          this.checkingDuplicate.set(false);
          this.proceedWithSubmit();
        }
      });
  }

  /** "Submit anyway" from the non-blocking duplicate warning dialog. */
  confirmSubmitDespiteDuplicate(): void {
    this.duplicateCheckAcknowledged = true;
    this.setShowDuplicateWarning(false);
    this.proceedWithSubmit();
  }

  /** "Go back and review" from the duplicate warning dialog — does not submit. */
  dismissDuplicateWarning(): void {
    this.setShowDuplicateWarning(false);
    this.duplicateCandidates.set([]);
  }

  /**
   * `.modal-overlay`/`.modal-dialog` (property-form.page.scss) is a
   * position:fixed full-screen overlay, same as the mobile nav drawer and
   * the other overlays — needs the same scroll lock so the page underneath
   * doesn't stay scrollable while this advisory dialog is up.
   */
  private setShowDuplicateWarning(open: boolean): void {
    if (this.showDuplicateWarning() === open) {
      return;
    }

    this.showDuplicateWarning.set(open);

    if (open) {
      this.scrollLock.lock();
    } else {
      this.scrollLock.unlock();
    }
  }

  private proceedWithSubmit(): void {
    const f = this.form.getRawValue();
    const isRent = f.listingType === 1;
    const isSale = f.listingType === 2;
    // §13 of the task brief: don't send context-inappropriate values, even if
    // clearFieldsNotApplicableToLand()/setListingType() already cleared them
    // client-side earlier — this is the last line of defense before the wire,
    // the backend's own conditional validation is the actual source of truth.
    const isLand = this.isLandCategory;

    const payload: PropertySavePayload = {
      Title: f.title!.trim(),
      Description: f.description!.trim(),
      ListingType: f.listingType!,
      Street: f.street!.trim(),
      City: f.city!.trim(),
      Region: f.region?.trim() ?? null,
      CountryCode: f.countryCode!.trim().toUpperCase(),
      PostalCode: f.postalCode?.trim() ?? null,
      Latitude: f.latitude ?? null,
      Longitude: f.longitude ?? null,
      CurrencyCode: f.currencyCode!.trim().toUpperCase(),
      ColdRent: isRent ? (f.coldRent ?? null) : null,
      WarmRent: isRent ? (f.warmRent ?? null) : null,
      PurchasePrice: isSale ? (f.purchasePrice ?? null) : null,
      Deposit: f.deposit ?? null,
      AdditionalCosts: isRent ? (f.additionalCosts ?? null) : null,
      Rooms: isLand ? null : (f.rooms ?? null),
      Area: f.area ?? null,
      Floor: isLand ? null : (f.floor ?? null),
      HasBalcony: !isLand && (f.hasBalcony ?? false),
      HasElevator: !isLand && (f.hasElevator ?? false),
      HasParkingSpace: !isLand && (f.hasParkingSpace ?? false),
      HeatingType: this.heatingTypeForSave(),
      AvailableFrom: f.availableFrom ?? null,
      // ✅ إصلاح: كان الحقل معرَّفاً في الـ payload لكن لم يُملأ أبداً — المرافق
      // المختارة من المستخدم لم تكن تُرسَل إلى الباك اند إطلاقاً.
      AmenityIds: Array.from(this.selectedAmenityIds()),
      // Phase-0, Task 0.
      GovernorateId: f.governorateId ?? null,
      DistrictId: f.districtId ?? null,
      DistrictText: f.districtText?.trim() || null,
      NeighborhoodId: f.neighborhoodId ?? null,
      NeighborhoodText: f.neighborhoodText?.trim() || null,
      PropertyTypeId: f.propertyTypeId ?? null,
      // Dynamic listing form (ListingType × PropertyType redesign, Syrian market).
      LegalStatus: isSale ? (f.ownershipType ?? null) : null,
      AreaUnit: f.areaUnit ?? AREA_UNIT_SQUARE_METER,
      RentalStartDate: isRent ? (f.rentalStartDate ?? null) : null,
      RentalEndDate: isRent ? (f.rentalEndDate ?? null) : null,
      RentalDurationType: isRent ? (f.rentalDurationType ?? null) : null,
      FurnishingStatus: isLand ? null : (f.furnishingStatus ?? null)
    };

    this.isSaving.set(true);

    const request$ = this.isEditMode()
      ? this.propertyApi.updateProperty(this.propertyId(), payload)
      : this.propertyApi.createProperty(payload);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          const saved = result as { id?: string; Id?: string };
          const savedId = saved?.id ?? saved?.Id ?? this.propertyId();

          if (this.selectedFiles().length > 0 && savedId) {
            this.uploadImages(savedId);
          } else {
            this.onSaveSuccess(savedId);
          }
        },
        error: err => {
          this.isSaving.set(false);
          this.handleSaveError(err);
        }
      });
  }

  /**
   * Defense in depth: ListingEligibilityGuard keeps most visitors from ever reaching
   * this page without a confirmed contact + a selected plan, but the guard reads a
   * profile fetch that can go stale between navigation and submit (e.g. two tabs, or
   * an admin revoking a plan mid-session) — CreatePropertyCommandHandler is the actual
   * source of truth, and these are its two 403 codes (see ForbiddenException.Code).
   * Anything else — including the pre-existing 409 quota conflict, which was never
   * specially handled before this method existed — falls through to the generic
   * message unchanged.
   */
  private handleSaveError(err: { status?: number; error?: { code?: string } }): void {
    const code = err?.error?.code;

    if (err?.status === 403 && code === 'LISTING_CONTACT_NOT_CONFIRMED') {
      this.submitError.set('PROPERTY_FORM.CONTACT_NOT_CONFIRMED');
      void this.router.navigate(['/profile'], { queryParams: { reason: 'confirm-required' } });
      return;
    }

    if (err?.status === 403 && code === 'LISTING_PLAN_REQUIRED') {
      this.submitError.set('PROPERTY_FORM.PLAN_REQUIRED');
      void this.router.navigate(['/pricing'], { queryParams: { reason: 'plan-required' } });
      return;
    }

    this.submitError.set('PROPERTY_FORM.SAVE_ERROR');
  }

  private uploadImages(propertyId: string): void {
    const formData = new FormData();

    for (const file of this.selectedFiles()) {
      formData.append('files', file);
    }

    this.propertyApi
      .uploadImages(propertyId, formData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.onSaveSuccess(propertyId),
        error: () => {
          this.showToast(this.translate.instant('PROPERTY_FORM.IMAGE_UPLOAD_WARNING'), 'error');
          this.onSaveSuccess(propertyId);
        }
      });
  }

  private onSaveSuccess(id: string): void {
    this.isSaving.set(false);

    this.showToast(
      this.translate.instant(
        this.isEditMode() ? 'PROPERTY_FORM.UPDATE_SUCCESS' : 'PROPERTY_FORM.CREATE_SUCCESS'
      ),
      'success'
    );

    if (id) {
      void this.router.navigate(['/properties', id]);
    } else {
      void this.router.navigate(['/properties']);
    }
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    if (type === 'success') {
      this.toast.success(message);
      return;
    }

    this.toast.error(message);
  }

  private normalizeCodes(): void {
    const raw = this.form.getRawValue();
    this.form.patchValue({
      countryCode: raw.countryCode?.trim().toUpperCase() ?? 'SY',
      currencyCode: raw.currencyCode?.trim().toUpperCase() ?? 'SYP'
    }, { emitEvent: false });
  }

  private firstValidationError(): string {
    const errors = this.form.errors ?? {};

    if (errors['coldRentRequired']) return 'PROPERTY_FORM.COLD_RENT_REQUIRED';
    if (errors['purchasePriceRequired']) return 'PROPERTY_FORM.PURCHASE_PRICE_REQUIRED';
    if (errors['warmRentBelowColdRent']) return 'PROPERTY_FORM.WARM_RENT_BELOW_COLD_RENT';
    if (errors['invalidCountryCode']) return 'PROPERTY_FORM.INVALID_COUNTRY_CODE';
    if (errors['invalidCurrencyCode']) return 'PROPERTY_FORM.INVALID_CURRENCY_CODE';
    if (errors['districtRequired']) return 'PROPERTY_FORM.DISTRICT_REQUIRED';

    // Dynamic listing form (ListingType × PropertyType redesign, Syrian market).
    if (errors['ownershipTypeRequired']) return 'PROPERTY_FORM.OWNERSHIP_TYPE_REQUIRED';
    if (errors['rentalEndBeforeStart']) return 'PROPERTY_FORM.RENTAL_END_BEFORE_START';
    if (errors['rentalStartDateRequired']) return 'PROPERTY_FORM.RENTAL_START_DATE_REQUIRED';
    if (errors['rentalEndDateRequired']) return 'PROPERTY_FORM.RENTAL_END_DATE_REQUIRED';
    if (errors['rentalDurationRequired']) return 'PROPERTY_FORM.RENTAL_DURATION_REQUIRED';
    if (errors['areaRequiredForLand']) return 'PROPERTY_FORM.AREA_REQUIRED_FOR_LAND';

    if (this.f.governorateId.errors?.['required']) return 'PROPERTY_FORM.GOVERNORATE_REQUIRED';
    if (this.f.propertyTypeId.errors?.['required']) return 'PROPERTY_FORM.PROPERTY_TYPE_REQUIRED';
    if (this.f.area.errors?.['areaGreaterThanTen']) return 'PROPERTY_FORM.AREA_TOO_SMALL';
    if (this.f.coldRent.errors?.['positiveNumber']) return 'PROPERTY_FORM.COLD_RENT_REQUIRED';
    if (this.f.warmRent.errors?.['positiveNumber']) return 'PROPERTY_FORM.WARM_RENT_REQUIRED';
    if (this.f.purchasePrice.errors?.['positiveNumber']) return 'PROPERTY_FORM.PURCHASE_PRICE_REQUIRED';
    if (this.f.deposit.errors?.['nonNegativeNumber']) return 'PROPERTY_FORM.DEPOSIT_INVALID';
    if (this.f.additionalCosts.errors?.['nonNegativeNumber']) return 'PROPERTY_FORM.ADDITIONAL_COSTS_INVALID';

    return 'PROPERTY_FORM.VALIDATION_ERROR';
  }

  hasError(ctrl: AbstractControl | null | undefined): boolean {
    return !!(ctrl?.invalid && (ctrl?.touched || ctrl?.dirty));
  }

  get f() {
    return this.form.controls;
  }

  get isRent(): boolean {
    return this.form.value.listingType === 1;
  }

  get isSale(): boolean {
    return this.form.value.listingType === 2;
  }
}
