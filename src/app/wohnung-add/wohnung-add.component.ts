import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WohnungenService ,Wohnung} from '../services/wohnungen.service';
import { WohnungenComponent } from '../wohnungen/wohnungen.component';

@Component({
  selector: 'app-wohnung-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wohnung-add.component.html'
})
export class WohnungAddComponent {

  selectedFiles: File[] = [];
  previews: string[] = [];

    wohnung: any = {
    Titel: '',
    Beschreibung: '',
    Adresse: '',
    Stadt: '',
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
    Energieausweis:'', // Enum als string
    Zustand:'', // Enum als string
    Status:'',
  };

  constructor(private router: Router, private wohnungenService: WohnungenService) {}

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
      alert('Wohnung + Bilder wurden gespeichert!');
      this.router.navigate(['/wohnungen']);
    },
    error: (err) => console.error(err)
  });
}

}