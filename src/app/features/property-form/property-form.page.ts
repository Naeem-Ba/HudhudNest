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
import { Property } from '../../core/models/property.model';
import { ToastService } from '../../shared/services/toast.service';
import { MapPickerComponent } from '../../map-picker/map-picker.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LanguageService, LangCode } from '../../core/services/language.service';

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
  HeatingType: number;
  AvailableFrom?: string | null;
  AmenityIds?: string[] | null;
}

const VALID_COUNTRY_CODES = new Set(['DE', 'SY', 'US', 'GB', 'FR', 'AE', 'SA', 'TR', 'EG', 'JO', 'LB']);
const VALID_CURRENCY_CODES = new Set(['EUR', 'USD', 'GBP', 'SYP', 'TRY', 'AED', 'SAR', 'EGP', 'JOD', 'LBP']);

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function positiveNumber(control: AbstractControl): ValidationErrors | null {
  const value = toNumberOrNull(control.value);
  return value === null || value > 0 ? null : { positiveNumber: true };
}

function nonNegativeNumber(control: AbstractControl): ValidationErrors | null {
  const value = toNumberOrNull(control.value);
  return value === null || value >= 0 ? null : { nonNegativeNumber: true };
}

function areaGreaterThanTen(control: AbstractControl): ValidationErrors | null {
  const value = toNumberOrNull(control.value);
  return value === null || value > 10 ? null : { areaGreaterThanTen: true };
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
    ImageFallbackDirective
  ],
  templateUrl: './property-form.page.html',
  styleUrls: ['./property-form.page.scss']
})
export class PropertyFormPage implements OnInit {
  private readonly propertyApi = inject(PropertyApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly langService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly isSaving = signal(false);
  readonly isEditMode = signal(false);
  readonly propertyId = signal('');
  readonly currentLang = signal<LangCode>('ar');
  readonly submitError = signal('');

  readonly selectedFiles = signal<File[]>([]);
  readonly previews = signal<string[]>([]);
  readonly fallbackImage = '/images/no-image.svg';
  readonly allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  readonly maxSizeMB = 5;

  readonly form = this.fb.group({
    listingType: [1, Validators.required],
    title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],
    street: ['', [Validators.required, Validators.maxLength(300)]],
    city: ['', [Validators.required, Validators.maxLength(150)]],
    region: [null as string | null, Validators.maxLength(150)],
    postalCode: [null as string | null, Validators.maxLength(20)],
    countryCode: ['SY', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
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
    floor: [null as number | null, Validators.min(0)],
    availableFrom: [null as string | null],
    heatingType: [0],
    hasBalcony: [false],
    hasElevator: [false],
    hasParkingSpace: [false]
  }, { validators: propertyFormValidator });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';

    if (id) {
      this.isEditMode.set(true);
      this.propertyId.set(id);
      this.loadExistingProperty(id);
    }

    this.bindLanguage();
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
    this.propertyApi
      .getProperty(id)
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
            hasParkingSpace: property.hasParkingSpace ?? false
          });

          const urls = (property.images ?? [])
            .map(image => image.url)
            .filter((url): url is string => Boolean(url));
          this.previews.set(urls);
        },
        error: () => this.submitError.set('PROPERTY_FORM.LOAD_ERROR')
      });
  }

  onLocationSelected(location: { lat: number; lng: number }): void {
    this.form.patchValue({ latitude: location.lat, longitude: location.lng });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const valid: File[] = [];

    for (const file of files) {
      if (!this.allowedTypes.includes(file.type)) {
        this.showToast(this.translate.instant('PROPERTY_FORM.INVALID_FILE_TYPE'), 'error');
        continue;
      }

      if (file.size > this.maxSizeMB * 1024 * 1024) {
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

    input.value = '';
  }

  removeImage(index: number): void {
    this.previews.update(prev => prev.filter((_, i) => i !== index));
    this.selectedFiles.update(prev => prev.filter((_, i) => i !== index));
  }

  setListingType(type: 1 | 2): void {
    this.form.patchValue({ listingType: type });

    if (type === 1) {
      this.form.patchValue({ purchasePrice: null });
    } else {
      this.form.patchValue({
        coldRent: null,
        warmRent: null,
        additionalCosts: null
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

    const f = this.form.getRawValue();
    const isRent = f.listingType === 1;
    const isSale = f.listingType === 2;

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
      Rooms: f.rooms ?? null,
      Area: f.area ?? null,
      Floor: f.floor ?? null,
      HasBalcony: f.hasBalcony ?? false,
      HasElevator: f.hasElevator ?? false,
      HasParkingSpace: f.hasParkingSpace ?? false,
      HeatingType: f.heatingType ?? 0,
      AvailableFrom: f.availableFrom ?? null
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
        error: () => {
          this.submitError.set('PROPERTY_FORM.SAVE_ERROR');
          this.isSaving.set(false);
        }
      });
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
