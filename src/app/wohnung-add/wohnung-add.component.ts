import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { EnumService, EnumItem } from '../services/enum.service';
import { WohnungenService, Wohnung, PropertySavePayload } from '../services/wohnungen.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MapPickerComponent } from '../map-picker/map-picker.component';
import { CITY_MAPS } from '../map-picker/city-map.config';
import { LanguageService, LangCode } from '../services/language.service';

@Component({
  selector: 'app-wohnung-add',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    EnumTranslatePipe,
    TranslateModule,
    MapPickerComponent
  ],
  templateUrl: './wohnung-add.component.html',
  styleUrls: ['./wohnung-add.component.scss']
})
export class WohnungAddComponent implements OnInit {
  @ViewChild(MapPickerComponent) mapPicker!: MapPickerComponent;

  currentLang: LangCode = 'ar';
  selectedFiles: File[] = [];
  previews: string[] = [];

  StadtList: EnumItem[] = [];
  ZustandList: EnumItem[] = [];
  StatusList: EnumItem[] = [];
  EnergieausweisTypList: EnumItem[] = [];

  isEditMode = false;
  wohnungId = '';

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

  lat!: number;
  lng!: number;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly wohnungenService: WohnungenService,
    private readonly enumService: EnumService,
    private readonly translate: TranslateService,
    private readonly languageService: LanguageService
  ) {}

  ngOnInit(): void {
    this.loadEnums();
    this.initLanguage();

    this.wohnungId = this.route.snapshot.paramMap.get('id') ?? '';

    if (this.wohnungId) {
      this.isEditMode = true;
      this.loadWohnung();
    }
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
    if (!this.wohnungId) {
      return;
    }

    this.wohnungenService.getWohnung(this.wohnungId).subscribe({
      next: (w) => {
        this.wohnung = { ...w };
        this.previews = w.Bilder?.map(b => b.Url) ?? [];
      },
      error: err => console.error('خطأ تحميل العقار:', err)
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files: File[] = Array.from(input.files ?? []);

    if (files.length === 0) {
      return;
    }

    this.selectedFiles = [...this.selectedFiles, ...files];

    files.forEach(file => {
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>) => {
        const result = e.target?.result;

        if (typeof result === 'string') {
          this.previews.push(result);
        }
      };

      reader.readAsDataURL(file);
    });
  }

  onLocationSelected(loc: { lat: number; lng: number }): void {
    this.wohnung.Latitude = loc.lat;
    this.wohnung.Longitude = loc.lng;
  }

  onCityChange(cityId: number): void {
    const city = CITY_MAPS.find(c => c.id === cityId);

    if (!city) {
      return;
    }

    this.mapPicker.updateCenter(city.lat, city.lng, city.zoom);
    this.wohnung.Latitude = city.lat;
    this.wohnung.Longitude = city.lng;
  }

  onSubmit(): void {
    const payload = this.buildPropertyPayload();

    if (this.isEditMode) {
      this.updateWohnung(payload);
    } else {
      this.createWohnung(payload);
    }
  }

  createWohnung(payload: PropertySavePayload): void {
    this.wohnungenService.addWohnung(payload).subscribe({
      next: (created) => {
        const propertyId = created.Id ?? created.id;

        if (!propertyId) {
          console.error('تم إنشاء العقار لكن لم يرجع Backend معرف العقار.');
          this.afterSave();
          return;
        }

        if (this.selectedFiles.length === 0) {
          this.afterSave();
          return;
        }

        this.wohnungenService.uploadWohnungBilder(propertyId, this.selectedFiles).subscribe({
          next: () => this.afterSave(),
          error: err => {
            console.error('تم إنشاء العقار، لكن حدث خطأ أثناء رفع الصور:', err);
            this.afterSave();
          }
        });
      },
      error: err => console.error('خطأ إنشاء العقار:', err)
    });
  }

  updateWohnung(payload: PropertySavePayload): void {
    if (!this.wohnungId) {
      return;
    }

    this.wohnungenService.updateWohnung(this.wohnungId, payload).subscribe({
      next: () => {
        if (this.selectedFiles.length === 0) {
          this.afterSave();
          return;
        }

        this.wohnungenService.uploadWohnungBilder(this.wohnungId, this.selectedFiles).subscribe({
          next: () => this.afterSave(),
          error: err => {
            console.error('تم تعديل العقار، لكن حدث خطأ أثناء رفع الصور:', err);
            this.afterSave();
          }
        });
      },
      error: err => console.error('خطأ تعديل العقار:', err)
    });
  }

  afterSave(): void {
    this.translate.get('wohnung_add.WoBiSave').subscribe(msg => {
      alert(msg);
      this.router.navigate(['/meine-anzeigen']);
    });
  }

  private buildPropertyPayload(): PropertySavePayload {
    return {
      OwnerId: '00000000-0000-0000-0000-000000000000',
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
    if (this.wohnung.ZumMieten && this.wohnung.ZumKaufen) {
      return 3;
    }

    if (this.wohnung.ZumKaufen) {
      return 2;
    }

    return 1;
  }

  private getHeatingType(): number {
    const value = String(this.wohnung.Heizung ?? '').toLowerCase();

    if (value.includes('central') || value.includes('zentral')) {
      return 1;
    }

    if (value.includes('gas')) {
      return 2;
    }

    if (value.includes('electric') || value.includes('strom')) {
      return 3;
    }

    if (value.includes('floor') || value.includes('boden')) {
      return 4;
    }

    if (value.includes('oil') || value.includes('öl') || value.includes('oel')) {
      return 5;
    }

    if (value.includes('solar')) {
      return 7;
    }

    if (value.includes('pump')) {
      return 8;
    }

    return 0;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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

    this.languageService.currentLang$.subscribe(lang => {
      this.currentLang = this.toLangCode(lang);
    });
  }

  private toLangCode(lang: string | null | undefined): LangCode {
    if (lang === 'ar' || lang === 'de' || lang === 'en') {
      return lang;
    }

    return 'ar';
  }
}