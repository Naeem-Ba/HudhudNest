import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { WohnungenService, Wohnung } from '../services/wohnungen.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './meine-anzeigen.component.html',
  styleUrls: ['./meine-anzeigen.component.scss']
})
export class MeineAnzeigenComponent implements OnInit {
  wohnungen: Wohnung[] = [];
  loading = false;
  errorMessage = '';
  now = new Date();

  constructor(
    private readonly service: WohnungenService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this.errorMessage = '';

    this.service.getMyWohnungen().subscribe({
      next: res => {
        console.log('Meine Anzeigen:', res);
        this.wohnungen = res;
        this.loading = false;
      },
      error: err => {
        console.error('Fehler beim Laden meiner Anzeigen:', err);
        this.errorMessage = 'Die Anzeigen konnten nicht geladen werden.';
        this.loading = false;
      }
    });
  }

  edit(id: string | undefined): void {
    if (!id) {
      return;
    }

    this.router.navigate(['/wohnungen/edit', id]);
  }

  delete(id: string | undefined): void {
    if (!id) {
      return;
    }

    this.service.deleteWohnung(id).subscribe({
      next: () => {
        this.wohnungen = this.wohnungen.filter(w => w.Id !== id && w.id !== id);
      },
      error: err => console.error('Fehler beim Löschen:', err)
    });
  }

  daysLeft(exp: string | undefined): number | null {
    if (!exp) {
      return null;
    }

    const diff = new Date(exp).getTime() - this.now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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