import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-wohnungen',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './wohnungen.component.html',
  styleUrls: ['./wohnungen.component.scss']
})
export class WohnungenComponent implements OnInit {
  wohnungen: Wohnung[] = [];
  loading = false;
  errorMessage = '';

  constructor(
    private readonly wohnungenService: WohnungenService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.errorMessage = '';

    this.wohnungenService.getWohnungen().subscribe({
      next: data => {
        console.log('Wohnungen vom Server:', data);
        this.wohnungen = data;
        this.loading = false;
      },
      error: err => {
        console.error('Fehler beim Laden der Wohnungen:', err);
        this.errorMessage = 'Die Wohnungen konnten nicht geladen werden.';
        this.loading = false;
      }
    });

    this.wohnungenService.wohnungAdded$.subscribe(neueWohnung => {
      this.wohnungen = [neueWohnung, ...this.wohnungen];
    });
  }

  gotoDetails(id: string | undefined): void {
    if (!id) {
      return;
    }

    this.router.navigate(['/wohnungen', id]);
  }

  getMainImage(w: Wohnung): string {
    return w.Bilder?.[0]?.Url || 'assets/no-image.jpg';
  }

  getPrice(w: Wohnung): number | undefined {
    return w.Kaufpreis || w.Warmmiete || w.Kaltmiete;
  }

  getId(w: Wohnung): string | undefined {
    return w.Id || w.id;
  }
}