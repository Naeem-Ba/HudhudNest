import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EnumService, EnumItem } from '../services/enum.service';
import { WohnungenService ,Wohnung} from '../services/wohnungen.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { TranslateModule } from '@ngx-translate/core';
import { TranslateService } from '@ngx-translate/core';


@Component({
  selector: 'app-wohnung-add',
  standalone: true,
  imports: [CommonModule, FormsModule, EnumTranslatePipe, TranslateModule],
  templateUrl: './wohnung-add.component.html',
  styleUrls: ['./wohnung-add.component.scss']
})
export class WohnungAddComponent implements OnInit { //إضافة OnInit

  selectedFiles: File[] = [];
  previews: string[] = [];
  StadtList: EnumItem[] = []; //استخدم النوع المحدد
  ZustandList: EnumItem[] = [];
  StatusList: EnumItem[] = [];
  EnergieausweisTypList: EnumItem[] = [];

    wohnung: Wohnung ={
    Titel: '',
    Beschreibung: '',
    Adresse: '',
    Stadt: 0,
    PLZ: '',
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
    Energieausweis: 0,
    Zustand: 0,
    Status: 0,
  };

  constructor(
    private router: Router,
    private wohnungenService: WohnungenService,
    private enumService: EnumService,
    private translate: TranslateService) {}

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
    this.enumService.getEnum('STADT').subscribe(res => this.StadtList = res);
    this.enumService.getEnum('ZUSTAND').subscribe(res => this.ZustandList = res);
    this.enumService.getEnum('STATUS').subscribe(res => this.StatusList = res);
    this.enumService.getEnum('ENERGIEAUSWEISTYP').subscribe(res => this.EnergieausweisTypList = res);
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
onSubmit() {
  const formData = new FormData();

  for (const key in this.wohnung) {
    formData.append(key, (this.wohnung as any)[key]);
  }

  this.selectedFiles.forEach(file => {
    formData.append('Bilder', file);
  });

this.wohnungenService.addWohnung(formData).subscribe({
  next: () => {

    // ترجمة الرسالة داخل TypeScript بشكل صحيح
    this.translate.get('wohnung_add.WoBiSave').subscribe(message => {
      alert(message);
      this.router.navigate(['/wohnungen']);
    });

  },
  error: (err) => {
    console.error(err);
  }
});

}

}