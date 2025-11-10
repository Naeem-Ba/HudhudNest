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
    wohnung = {
    Titel: '',
    Beschreibung: '',
    Adresse: '',
    ZumMieten: true,
    Kaltmiete:0,
    Kaution:0,
    Zimmer:0,
    Flaeche:0,
  };

  constructor(private router: Router, private wohnungenService: WohnungenService) {}

onSubmit() {
  console.log('📦 Gesendete Wohnung:', this.wohnung);
  this.wohnungenService.addWohnung(this.wohnung).subscribe({
    next: (neu) => {
      alert('Wohnung wurde hinzugefügt!');
      this.router.navigate(['/wohnungen']);
    },
    error: (err) => {
      console.error('Fehler beim Hinzufügen:', err);
    }
  });
}
}