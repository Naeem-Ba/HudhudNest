// =============================================================
// src/app/features/property-form/property-form.page.ts
//
// بديل عن: wohnung-add/wohnung-add.component.ts
//
// التحسينات:
//   ✅ Reactive Forms (بدل Template-driven)
//   ✅ PropertyApiService + PropertySavePayload الصحيح
//   ✅ Signals + OnPush
//   ✅ inject() الحديث
//   ✅ تحقق صارم من الحقول مع رسائل i18n
//   ✅ رفع الصور عبر FormData → /api/properties/{id}/images
//   ✅ MapPickerComponent مربوط
//   ✅ دعم وضع الإنشاء والتعديل
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PropertyApiService } from '../../core/services/property-api.service';
import { AuthService } from '../../services/auth.service';
import { EnumService } from '../../services/enum.service';
import { ToastService } from '../../shared/services/toast.service';
import { MapPickerComponent } from '../../map-picker/map-picker.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LanguageService, LangCode } from '../../services/language.service';

/** مطابق تماماً لـ POST /api/Properties body */
interface PropertySavePayload {
  Title: string;
  Description: string;
  ListingType: number;           // 1=ForRent, 2=ForSale, 3=ForRentAndSale
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

@Component({
  selector: 'app-property-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    MapPickerComponent,
    ImageFallbackDirective
  ],
  templateUrl: './property-form.page.html',
  styleUrls: ['./property-form.page.scss']
})
export class PropertyFormPage implements OnInit {

  @ViewChild(MapPickerComponent) mapPicker!: MapPickerComponent;

  // ── DI ────────────────────────────────────────────────────────────────
  private readonly propertyApi = inject(PropertyApiService);
  private readonly authService = inject(AuthService);
  private readonly enumService = inject(EnumService);
  private readonly router      = inject(Router);
  private readonly route       = inject(ActivatedRoute);
  private readonly translate   = inject(TranslateService);
  private readonly toast       = inject(ToastService);
  private readonly langService = inject(LanguageService);
  private readonly destroyRef  = inject(DestroyRef);
  private readonly fb          = inject(FormBuilder);

  // ── State ─────────────────────────────────────────────────────────────
  readonly isSaving     = signal(false);
  readonly isEditMode   = signal(false);
  readonly propertyId   = signal('');
  readonly currentLang  = signal<LangCode>('ar');
  readonly cityList     = signal<{ Id: string; Name: string }[]>([]);
  readonly submitError  = signal('');

  // ── Image Upload ──────────────────────────────────────────────────────
  readonly selectedFiles = signal<File[]>([]);
  readonly previews      = signal<string[]>([]);
  readonly fallbackImage = '/images/no-image.svg';
  readonly allowedTypes  = ['image/png', 'image/jpeg', 'image/webp'];
  readonly maxSizeMB     = 5;

  // ── Form ──────────────────────────────────────────────────────────────
  readonly form = this.fb.group({
    // Listing Type: 1=ForRent, 2=ForSale
    listingType:       [1, Validators.required],

    // Basics
    title:             ['', [Validators.required, Validators.minLength(3), Validators.maxLength(200)]],
    description:       ['', [Validators.required, Validators.minLength(10), Validators.maxLength(5000)]],

    // Location
    street:            ['', Validators.required],
    city:              ['', Validators.required],
    region:            [null as string | null],
    postalCode:        [null as string | null, Validators.maxLength(20)],
    countryCode:       ['SY', Validators.required],
    latitude:          [null as number | null],
    longitude:         [null as number | null],

    // Pricing
    currencyCode:      ['SYP', Validators.required],
    coldRent:          [null as number | null],
    warmRent:          [null as number | null],
    purchasePrice:     [null as number | null],
    deposit:           [null as number | null],
    additionalCosts:   [null as number | null],

    // Details
    rooms:             [null as number | null, [Validators.min(1), Validators.max(50)]],
    area:              [null as number | null, Validators.min(1)],
    floor:             [null as number | null, Validators.min(0)],
    availableFrom:     [null as string | null],
    heatingType:       [0],

    // Features
    hasBalcony:        [false],
    hasElevator:       [false],
    hasParkingSpace:   [false],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (id) {
      this.isEditMode.set(true);
      this.propertyId.set(id);
      this.loadExistingProperty(id);
    }

    this.currentLang.set(this.langService.getCurrentLang() as LangCode);
    this.loadCities();
  }

  private loadExistingProperty(id: string): void {
    this.propertyApi
      .getProperty(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: p => {
          this.form.patchValue({
            title:       p.title,
            description: p.description,
            street:      p.street,
            city:        p.city,
            region:      p.region ?? null,
            postalCode:  p.postalCode ?? null,
            countryCode: p.countryCode ?? 'SY',
            latitude:    p.latitude ?? null,
            longitude:   p.longitude ?? null,
            currencyCode:    p.currencyCode ?? 'SYP',
            coldRent:        p.coldRent ?? null,
            warmRent:        p.warmRent ?? null,
            purchasePrice:   p.purchasePrice ?? null,
            deposit:         p.deposit ?? null,
            additionalCosts: p.additionalCosts ?? null,
            rooms:       p.rooms ?? null,
            area:        p.area ?? null,
            floor:       p.floor ?? null,
            hasBalcony:  p.hasBalcony ?? false,
            hasElevator: p.hasElevator ?? false,
            hasParkingSpace: p.hasParkingSpace ?? false,
          });

          // Set previews from existing images
          const urls = (p.images ?? []).map(img => img.url).filter(Boolean);
          this.previews.set(urls);
        },
        error: () => this.submitError.set('PROPERTY_FORM.LOAD_ERROR')
      });
  }

  private loadCities(): void {
    this.enumService.getEnum('STADT')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => this.cityList.set(items as any[]),
        error: () => {}
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
        this.toast.show(this.translate.instant('PROPERTY_FORM.INVALID_FILE_TYPE'), 'error');
        continue;
      }
      if (file.size > this.maxSizeMB * 1024 * 1024) {
        this.toast.show(this.translate.instant('PROPERTY_FORM.FILE_TOO_LARGE', { name: file.name }), 'error');
        continue;
      }
      valid.push(file);
    }

    this.selectedFiles.update(prev => [...prev, ...valid]);

    // Generate previews
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

  setListingType(type: 1 | 2): void {
    this.form.patchValue({ listingType: type });
    // Clear irrelevant price fields
    if (type === 1) {
      this.form.patchValue({ purchasePrice: null });
    } else {
      this.form.patchValue({ coldRent: null, warmRent: null, deposit: null, additionalCosts: null });
    }
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const f = this.form.getRawValue();
    const isRent = f.listingType === 1;
    const isSale = f.listingType === 2;

    // Validate price fields
    if (isRent && !f.coldRent) {
      this.submitError.set('PROPERTY_FORM.COLD_RENT_REQUIRED');
      return;
    }
    if (isSale && !f.purchasePrice) {
      this.submitError.set('PROPERTY_FORM.PURCHASE_PRICE_REQUIRED');
      return;
    }

    const payload: PropertySavePayload = {
      Title:          f.title!.trim(),
      Description:    f.description!.trim(),
      ListingType:    f.listingType!,
      Street:         f.street!.trim(),
      City:           f.city!.trim(),
      Region:         f.region?.trim() ?? null,
      CountryCode:    f.countryCode!.trim(),
      PostalCode:     f.postalCode?.trim() ?? null,
      Latitude:       f.latitude ?? null,
      Longitude:      f.longitude ?? null,
      CurrencyCode:   f.currencyCode!.trim(),
      ColdRent:       isRent ? (f.coldRent ?? null) : null,
      WarmRent:       isRent ? (f.warmRent ?? null) : null,
      PurchasePrice:  isSale ? (f.purchasePrice ?? null) : null,
      Deposit:        isRent ? (f.deposit ?? null) : null,
      AdditionalCosts: isRent ? (f.additionalCosts ?? null) : null,
      Rooms:          f.rooms ?? null,
      Area:           f.area ?? null,
      Floor:          f.floor ?? null,
      HasBalcony:     f.hasBalcony ?? false,
      HasElevator:    f.hasElevator ?? false,
      HasParkingSpace: f.hasParkingSpace ?? false,
      HeatingType:    f.heatingType ?? 0,
      AvailableFrom:  f.availableFrom ?? null,
    };

    this.isSaving.set(true);
    this.submitError.set('');

    const request$ = this.isEditMode()
      ? this.propertyApi.updateProperty(this.propertyId(), payload)
      : this.propertyApi.createProperty(payload);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: any) => {
          const savedId = result?.id ?? result?.Id ?? this.propertyId();
          // Upload images if any
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
          // Property saved but images failed
          this.toast.show(this.translate.instant('PROPERTY_FORM.IMAGE_UPLOAD_WARNING'), 'error');
          this.onSaveSuccess(propertyId);
        }
      });
  }

  private onSaveSuccess(id: string): void {
    this.isSaving.set(false);
    this.toast.show(
      this.translate.instant(
        this.isEditMode() ? 'PROPERTY_FORM.UPDATE_SUCCESS' : 'PROPERTY_FORM.CREATE_SUCCESS'
      ),
      'success'
    );
    this.router.navigate(['/properties', id]);
  }

  // Helper for template
  hasError(ctrl: AbstractControl | null | undefined): boolean {
    return !!(ctrl?.invalid && (ctrl?.touched || ctrl?.dirty));
  }

  get f() { return this.form.controls; }
  get isRent() { return this.form.value.listingType === 1; }
  get isSale() { return this.form.value.listingType === 2; }
}