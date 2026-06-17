// =====================================================================
// ✅ FIX #2 – wohnung-add.component.ts
// المشكلة: OwnerId مُشفَّر كـ GUID صفري "00000000-0000-0000-0000-000000000000"
// الحل: قراءة ID المستخدم الحقيقي من AuthService
// =====================================================================
import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';

import { EnumService, EnumItem } from '../services/enum.service';
import { WohnungenService, Wohnung, PropertySavePayload } from '../services/wohnungen.service';
import { AuthService } from '../services/auth.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MapPickerComponent } from '../map-picker/map-picker.component';
import { CITY_MAPS } from '../map-picker/city-map.config';
import { LanguageService, LangCode } from '../services/language.service';
import { ToastService } from '../shared/services/toast.service';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-wohnung-add',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EnumTranslatePipe,
    TranslateModule,
    MapPickerComponent,
    ImageFallbackDirective
  ],
  templateUrl: './wohnung-add.component.html',
  styleUrls: ['./wohnung-add.component.scss']
})
export class WohnungAddComponent implements OnInit, OnDestroy {
  @ViewChild(MapPickerComponent) mapPicker!: MapPickerComponent;

  currentLang: LangCode = 'ar';
  selectedFiles: File[] = [];
  previews: string[] = [];
  isSaving = false;
  submitted = false;
  submitError = '';
  readonly fallbackImage = '/images/no-image.svg';
  readonly allowedImageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
  readonly maxImageSizeMB = 5;

  StadtList: EnumItem[] = [];
  ZustandList: EnumItem[] = [];
  StatusList: EnumItem[] = [];
  EnergieausweisTypList: EnumItem[] = [];

  isEditMode = false;
  wohnungId = '';

  // ✅ ID المستخدم الحقيقي من AuthService
  private currentUserId = '';
  private readonly subs = new Subscription();

  wohnung: Wohnung = {
    Titel: '',
    Beschreibung: '',
    Adresse: '',
    Stadt: null as any,
    PLZ: '',
    Latitude: 0,
    Longitude: 0,
    ZumMieten: false,
    ZumKaufen: false,
    Kaltmiete: 0,
    Warmmiete: 0,
    Kaufpreis: 0,
    Nebenkosten: 0,
    Kaution: 0,
    Zimmer: 0,
    Flaeche: 0,
    Geschoss: 0,
    FreiAb: '',
    Balkon: false,
    Aufzug: false,
    Stellplatz: false,
    Heizung: '',
    Energieausweis: null as any,
    Zustand: null as any,
    Status: null as any
  };

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly wohnungenService: WohnungenService,
    private readonly authService: AuthService,
    private readonly enumService: EnumService,
    private readonly translate: TranslateService,
    private readonly languageService: LanguageService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    // ✅ FIX #2: اقرأ ID المستخدم الحقيقي فور تهيئة المكوّن
    this.subs.add(
      this.authService.currentUser$.pipe(take(1)).subscribe(user => {
        this.currentUserId = user?.id ?? user?.Id ?? '';
      })
    );

    this.loadEnums();
    this.initLanguage();

    this.wohnungId = this.route.snapshot.paramMap.get('id') ?? '';

    if (this.wohnungId) {
      this.isEditMode = true;
      this.loadWohnung();
    }
  }

  ngOnDestroy(): void {
    // ✅ FIX #3 مطبّق هنا أيضاً: إلغاء جميع الاشتراكات
    this.subs.unsubscribe();
  }

  setMode(mode: 'mieten' | 'kaufen'): void {
    if (mode === 'mieten') {
      this.wohnung.ZumMieten = true;
      this.wohnung.ZumKaufen = false;
      this.wohnung.Kaufpreis = 0;
    }

    if (mode === 'kaufen') {
      this.wohnung.ZumKaufen = true;
      this.wohnung.ZumMieten = false;
      this.wohnung.Kaltmiete = 0;
      this.wohnung.Warmmiete = 0;
      this.wohnung.Nebenkosten = 0;
      this.wohnung.Kaution = 0;
    }
  }

  loadWohnung(): void {
    if (!this.wohnungId) return;

    this.subs.add(
      this.wohnungenService.getWohnung(this.wohnungId).subscribe({
        next: (w) => {
          this.wohnung = { ...w };
          this.previews = w.Bilder?.map(b => b.Url) ?? [];
        },
        error: err => console.error('خطأ تحميل العقار:', err)
      })
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files: File[] = Array.from(input.files ?? []);

    if (files.length === 0) return;

    const validFiles: File[] = [];

    for (const file of files) {
      if (!this.allowedImageTypes.includes(file.type)) {
        this.toast.error(this.translate.instant('VALIDATION.IMAGE_TYPE'));
        continue;
      }

      if (file.size / 1024 / 1024 > this.maxImageSizeMB) {
        this.toast.error(this.translate.instant('VALIDATION.IMAGE_SIZE'));
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      input.value = '';
      return;
    }

    this.selectedFiles = [...this.selectedFiles, ...validFiles];

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result;
        if (typeof result === 'string') {
          this.previews.push(result);
        }
      };
      reader.readAsDataURL(file);
    });

    input.value = '';
  }

  removeSelectedFile(index: number): void {
    this.selectedFiles.splice(index, 1);
    this.previews.splice(index, 1);
    this.selectedFiles = [...this.selectedFiles];
    this.previews = [...this.previews];
  }

  onLocationSelected(loc: { lat: number; lng: number }): void {
    this.wohnung.Latitude = loc.lat;
    this.wohnung.Longitude = loc.lng;
  }

  onCityChange(cityId: number | string | null): void {
    const numericCityId = Number(cityId);
    const city = CITY_MAPS.find(c => c.id === numericCityId);

    if (!city) return;

    this.mapPicker?.updateCenter(city.lat, city.lng, city.zoom);
    this.wohnung.Latitude = city.lat;
    this.wohnung.Longitude = city.lng;
  }

  onSubmit(form?: NgForm): void {
    this.submitted = true;
    this.submitError = '';

    if (form) {
      form.control.markAllAsTouched();
    }

    if (form?.invalid) {
      this.submitError = this.translate.instant('VALIDATION.FIX_FIELDS');
      this.toast.error(this.submitError);
      return;
    }

    const payload = this.buildPropertyPayload();
    const validationMessage = this.validatePropertyPayload(payload);

    if (validationMessage) {
      this.submitError = validationMessage;
      this.toast.error(validationMessage);
      return;
    }

    this.isSaving = true;

    if (this.isEditMode) {
      this.updateWohnung(payload);
    } else {
      this.createWohnung(payload);
    }
  }

  private validatePropertyPayload(payload: PropertySavePayload): string | null {
    if (!payload.Title?.trim()) {
      return this.translate.instant('wohnung_add.validation_title');
    }

    if (!payload.Description?.trim()) {
      return this.translate.instant('wohnung_add.validation_description');
    }

    if (!payload.City?.trim()) {
      return this.translate.instant('wohnung_add.validation_city');
    }

    if (!payload.Street?.trim()) {
      return this.translate.instant('wohnung_add.validation_address');
    }

    if (payload.ListingType === 1 && (!payload.ColdRent || payload.ColdRent <= 0)) {
      return this.translate.instant('wohnung_add.validation_cold_rent');
    }

    if (payload.ListingType === 2 && (!payload.PurchasePrice || payload.PurchasePrice <= 0)) {
      return this.translate.instant('wohnung_add.validation_purchase_price');
    }

    if (
      payload.ListingType === 3 &&
      (!payload.ColdRent || payload.ColdRent <= 0 || !payload.PurchasePrice || payload.PurchasePrice <= 0)
    ) {
      return this.translate.instant('wohnung_add.validation_rent_sale');
    }

    if (payload.Rooms !== null && payload.Rooms !== undefined && (payload.Rooms < 1 || payload.Rooms > 50)) {
      return this.translate.instant('wohnung_add.validation_rooms');
    }

    if (payload.Area !== null && payload.Area !== undefined && payload.Area <= 10) {
      return this.translate.instant('wohnung_add.validation_area');
    }

    const hasLat = payload.Latitude !== null && payload.Latitude !== undefined;
    const hasLng = payload.Longitude !== null && payload.Longitude !== undefined;

    if (hasLat !== hasLng) {
      return this.translate.instant('wohnung_add.validation_location');
    }

    return null;
  }

  createWohnung(payload: PropertySavePayload): void {
    this.subs.add(
      this.wohnungenService.addWohnung(payload).subscribe({
        next: (created) => {
          const propertyId = created.Id ?? created.id;

          if (!propertyId) {
            console.error('تم إنشاء العقار لكن لم يرجع Backend معرف العقار.');
            this.afterSave();
            return;
          }

          this.subs.add(
            this.wohnungenService.publishWohnung(propertyId).subscribe({
              next: () => this.uploadImagesOrFinish(propertyId),
              error: err => {
                console.error('تم إنشاء العقار، لكن حدث خطأ أثناء نشره:', err);
                this.afterSave();
              }
            })
          );
        },
        error: err => this.handleSaveError(err, 'تعذر إنشاء العقار.')
      })
    );
  }

  private uploadImagesOrFinish(propertyId: string): void {
    if (this.selectedFiles.length === 0) {
      this.afterSave();
      return;
    }

    this.subs.add(
      this.wohnungenService.uploadWohnungBilder(propertyId, this.selectedFiles).subscribe({
        next: () => this.afterSave(),
        error: err => {
          console.error('تم إنشاء العقار ونشره، لكن حدث خطأ أثناء رفع الصور:', err);
          this.afterSave();
        }
      })
    );
  }

  updateWohnung(payload: PropertySavePayload): void {
    if (!this.wohnungId) return;

    this.subs.add(
      this.wohnungenService.updateWohnung(this.wohnungId, payload).subscribe({
        next: () => {
          if (this.selectedFiles.length === 0) {
            this.afterSave();
            return;
          }

          this.subs.add(
            this.wohnungenService.uploadWohnungBilder(this.wohnungId, this.selectedFiles).subscribe({
              next: () => this.afterSave(),
              error: err => {
                console.error('تم تعديل العقار، لكن حدث خطأ أثناء رفع الصور:', err);
                this.afterSave();
              }
            })
          );
        },
        error: err => this.handleSaveError(err, 'تعذر تعديل العقار.')
      })
    );
  }

  afterSave(): void {
    this.isSaving = false;
    this.submitted = false;
    const message = this.translate.instant('wohnung_add.WoBiSave');
    this.toast.success(message);
    this.router.navigate(['/meine-anzeigen']);
  }

  private handleSaveError(error: unknown, fallbackMessage: string): void {
    console.error(fallbackMessage, error);
    this.isSaving = false;
    this.submitError = fallbackMessage;
    this.toast.error(fallbackMessage);
  }

  private buildPropertyPayload(): PropertySavePayload {
    return {
      // ✅ FIX #2: لا GUID صفري – Backend يستخرج OwnerId من JWT
      // إذا كان Backend يحتاجه صراحةً، أرسل currentUserId
      // OwnerId: this.currentUserId || undefined,

      Title: this.wohnung.Titel,
      Description: this.wohnung.Beschreibung,
      ListingType: this.getListingType(),
      Street: this.wohnung.Adresse,
      City: String(this.wohnung.Stadt ?? ''),
      Region: null,
      CountryCode: 'SY',
      PostalCode: this.wohnung.PLZ || null,
      Latitude: this.wohnung.Latitude ?? null,
      Longitude: this.wohnung.Longitude ?? null,
      ColdRent: this.wohnung.ZumMieten ? this.toNullableNumber(this.wohnung.Kaltmiete) : null,
      WarmRent: this.wohnung.ZumMieten ? this.toNullableNumber(this.wohnung.Warmmiete) : null,
      PurchasePrice: this.wohnung.ZumKaufen ? this.toNullableNumber(this.wohnung.Kaufpreis) : null,
      Deposit: this.toNullableNumber(this.wohnung.Kaution),
      AdditionalCosts: this.toNullableNumber(this.wohnung.Nebenkosten),
      CurrencyCode: 'SYP',
      Rooms: this.toNullableInteger(this.wohnung.Zimmer),
      Area: this.toNullableNumber(this.wohnung.Flaeche),
      Floor: this.toNullableInteger(this.wohnung.Geschoss),
      HasBalcony: !!this.wohnung.Balkon,
      HasElevator: !!this.wohnung.Aufzug,
      HasParkingSpace: !!this.wohnung.Stellplatz,
      HeatingType: this.getHeatingType(),
      AvailableFrom: this.wohnung.FreiAb || null,
      AmenityIds: []
    };
  }

  private getListingType(): number {
    if (this.wohnung.ZumMieten && this.wohnung.ZumKaufen) return 3;
    if (this.wohnung.ZumKaufen) return 2;
    return 1;
  }

  private getHeatingType(): number {
    const value = String(this.wohnung.Heizung ?? '').toLowerCase();
    if (value.includes('central') || value.includes('zentral')) return 1;
    if (value.includes('gas'))    return 2;
    if (value.includes('electric') || value.includes('strom')) return 3;
    if (value.includes('floor') || value.includes('boden'))   return 4;
    if (value.includes('oil') || value.includes('öl') || value.includes('oel')) return 5;
    if (value.includes('solar')) return 7;
    if (value.includes('pump'))  return 8;
    return 0;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return n > 0 ? n : null;
  }

  private toNullableInteger(value: unknown): number | null {
    const n = this.toNullableNumber(value);
    return n === null ? null : Math.trunc(n);
  }

  private loadEnums(): void {
    this.StadtList = this.enumService.getList('STADT');
    this.ZustandList = this.enumService.getList('ZUSTAND');
    this.StatusList = this.enumService.getList('STATUS');
    this.EnergieausweisTypList = this.enumService.getList('ENERGIEAUSWEISTYP');
  }

  private initLanguage(): void {
    this.currentLang = this.toLangCode(this.languageService.getCurrent());

    // ✅ FIX #3: نضيف subscription اللغة لـ subs لإلغائه في ngOnDestroy
    this.subs.add(
      this.languageService.currentLang$.subscribe(lang => {
        this.currentLang = this.toLangCode(lang);
      })
    );
  }

  private toLangCode(lang: string | null | undefined): LangCode {
    if (lang === 'ar' || lang === 'de' || lang === 'en') return lang;
    return 'ar';
  }
}
