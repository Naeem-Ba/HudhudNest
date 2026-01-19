import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute} from '@angular/router';
import { EnumService, EnumItem } from '../services/enum.service';
import { WohnungenService ,Wohnung} from '../services/wohnungen.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MapPickerComponent } from '../map-picker/map-picker.component';
import { CITY_MAPS } from '../map-picker/city-map.config';
import { LanguageService } from '../services/language.service';


@Component({
  selector: 'app-wohnung-add',
  standalone: true,
  imports: [CommonModule, FormsModule, EnumTranslatePipe, TranslateModule,MapPickerComponent],
  templateUrl: './wohnung-add.component.html',
  styleUrls: ['./wohnung-add.component.scss']
})
export class WohnungAddComponent implements OnInit { //إضافة OnInit

  @ViewChild(MapPickerComponent) mapPicker!: MapPickerComponent;
  
  currentLang!: any;
  selectedFiles: File[] = [];
  previews: string[] = [];
  StadtList: EnumItem[] = []; //استخدم النوع المحدد
  ZustandList: EnumItem[] = [];
  StatusList: EnumItem[] = [];
  EnergieausweisTypList: EnumItem[] = [];
  isEditMode = false;
  wohnungId!: number;


    wohnung: Wohnung ={
    Titel: '',
    Beschreibung: '',
    Adresse: '',
    Stadt: null as any,
    PLZ: '',
    Latitude: 0,
    Longitude: 0,
    ZumMieten: false,
    ZumKaufen: false,
    Kaltmiete:0,
    Warmmiete:0,
    Kaufpreis:0,
    Nebenkosten:0,
    Kaution:0,
    Zimmer:0,
    Flaeche:0,  
    Geschoss: 0,
    FreiAb: '',
    Balkon:false,
    Aufzug:false,
    Stellplatz:false,
    Heizung: '',
    Energieausweis: null as any,
    Zustand: null as any,
    Status: null as any,
  };

  constructor(
    private router: Router,
    private route: ActivatedRoute, 
    private wohnungenService: WohnungenService,
    private enumService: EnumService,
    private translate: TranslateService,
    private languageService: LanguageService) {}

    // عند تغيير حالة "ZumMieten" تعطيل "ZumKaufen"
  setMode(mode: 'mieten' | 'kaufen') {
  if (mode === 'mieten') {
    this.wohnung.ZumMieten = true;
    this.wohnung.ZumKaufen = false;

    // تنظيف قيم البيع
    this.wohnung.Kaufpreis = 0;
  }

  if (mode === 'kaufen') {
    this.wohnung.ZumKaufen = true;
    this.wohnung.ZumMieten = false;

    // تنظيف قيم الإيجار
    this.wohnung.Kaltmiete = 0;
    this.wohnung.Warmmiete = 0;
    this.wohnung.Nebenkosten = 0;
    this.wohnung.Kaution = 0;
  }
}

  ngOnInit(): void {
    // تحميل القوائم وربطها
    this.StadtList = this.enumService.getList('STADT');
    this.ZustandList = this.enumService.getList('ZUSTAND');
    this.StatusList = this.enumService.getList('STATUS');
    this.EnergieausweisTypList = this.enumService.getList('ENERGIEAUSWEISTYP');

     this.currentLang = this.languageService.getCurrent();
     this.languageService.currentLang$.subscribe(lang => {
      this.currentLang = lang;
    });

    this.wohnungId = Number(this.route.snapshot.paramMap.get('id'));

  if (this.wohnungId) {
    this.isEditMode = true;
    this.loadWohnung();
  }
  }

  loadWohnung() {
  this.wohnungenService.getWohnung(this.wohnungId).subscribe({
    next: (w) => {
      this.wohnung = { ...w }; 
      this.previews = w.Bilder?.map(b => b.Url) ?? [];
    },
    error: err => console.error(err)
  });
}


  onFileSelected(event: any) {
    const files: File[] = Array.from(event.target.files);

   // دمج الملفات الجديدة مع القديمة
   this.selectedFiles = [...this.selectedFiles, ...files];

   // إنشاء معاينة (Preview)
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.previews.push(e.target.result);
      };
      reader.readAsDataURL(file);
    });
  
}

lat!: number;
lng!: number;

 onLocationSelected(loc: { lat: number; lng: number }) {
    this.wohnung.Latitude = loc.lat;
    this.wohnung.Longitude = loc.lng;
  }

  onCityChange(cityId: number) {
    const city = CITY_MAPS.find(c => c.id === cityId);
    if (!city) return;

    this.mapPicker.updateCenter(city.lat, city.lng, city.zoom);
    this.wohnung.Latitude = city.lat;
    this.wohnung.Longitude = city.lng;
  }

onSubmit() {
  const formData = new FormData();

  Object.entries(this.wohnung).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      formData.append(key, value as any);
    }
  });

  this.selectedFiles.forEach(file => {
    formData.append('Bilder', file);
  });

  if (this.isEditMode) {
    this.updateWohnung(formData);
  } else {
    this.createWohnung(formData);
  }
}
createWohnung(formData: FormData) {
  this.wohnungenService.addWohnung(formData).subscribe({
    next: () => this.afterSave(),
    error: err => console.error(err)
  });
}
updateWohnung(formData: FormData) {
  this.wohnungenService.updateWohnung(this.wohnungId, formData).subscribe({
    next: () => this.afterSave(),
    error: err => console.error(err)
  });
}
afterSave() {
  this.translate.get('wohnung_add.WoBiSave').subscribe(msg => {
    alert(msg);
    this.router.navigate(['/meine-anzeigen']);
  });
}

}