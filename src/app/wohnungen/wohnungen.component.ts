import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-wohnungen',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, EmptyStateComponent, SkeletonCardGridComponent, ImageFallbackDirective],
  templateUrl: './wohnungen.component.html',
  styleUrls: ['./wohnungen.component.scss']
})
export class WohnungenComponent implements OnInit, OnDestroy {
  wohnungen: Wohnung[] = [];
  loading = false;
  errorMessage = '';

  readonly fallbackImage = '/images/no-image.svg';
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly wohnungenService: WohnungenService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.loadWohnungen();

    this.subscriptions.add(
      this.wohnungenService.wohnungAdded$.subscribe(neueWohnung => {
        this.wohnungen = [neueWohnung, ...this.wohnungen];
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadWohnungen(): void {
    this.loading = true;
    this.errorMessage = '';

    this.wohnungenService.getWohnungen().subscribe({
      next: data => {
        this.wohnungen = data ?? [];
        this.loading = false;
      },
      error: err => {
        console.error('Fehler beim Laden der Wohnungen:', err);
        this.errorMessage = 'تعذر تحميل العقارات. تحقق من تشغيل الـ Backend ثم حاول مرة أخرى.';
        this.loading = false;
      }
    });
  }

  gotoDetails(id: string | undefined): void {
    if (!id) {
      return;
    }

    this.router.navigate(['/wohnungen', id]);
  }

  trackById(_: number, wohnung: Wohnung): string {
    return this.getId(wohnung) ?? String(_);
  }

  getMainImage(w: Wohnung): string {
    const images = w.Bilder ?? [];
    const mainImage = images.find(image => image.IsMain) ?? images[0];
    return mainImage?.Url || this.fallbackImage;
  }

  getPriceValue(w: Wohnung): number | undefined {
    return w.Kaufpreis || w.Warmmiete || w.Kaltmiete;
  }

  getFormattedPrice(w: Wohnung): string {
    const price = this.getPriceValue(w);

    if (!price) {
      return '—';
    }

    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency',
        currency: 'SYP',
        maximumFractionDigits: 0
      }).format(price);
    } catch {
      return `${price.toLocaleString('ar')} SYP`;
    }
  }

  getLocation(w: Wohnung): string {
    return [w.Adresse, w.Stadt, w.PLZ].filter(Boolean).join('، ') || '—';
  }

  getDescription(w: Wohnung): string {
    return w.Beschreibung?.trim() || 'لا يوجد وصف متاح لهذا العقار.';
  }

  getId(w: Wohnung): string | undefined {
    return w.Id || w.id;
  }
}
