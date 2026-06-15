import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { WohnungenService, Wohnung } from '../services/wohnungen.service';
import { EnumTranslatePipe } from '../pipes/enum-translate.pipe';
import { WohnungMapViewComponent } from './wohnungMapView/wohnungMapView.component';
import { LoadingSpinnerComponent } from '../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../shared/ui/empty-state.component';
import { ImageFallbackDirective } from '../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-wohnung-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    EnumTranslatePipe,
    TranslateModule,
    WohnungMapViewComponent,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    ImageFallbackDirective
  ],
  templateUrl: './wohnung-detail.component.html',
  styleUrls: ['./wohnung-detail.component.scss']
})
export class WohnungDetailComponent implements OnInit {
  wohnung: Wohnung | null = null;
  loading = true;
  errorMessage = '';
  currentIndex = 0;
  modalOpen = false;

  readonly fallbackImage = '/images/no-image.svg';

  startX = 0;
  currentX = 0;
  isDragging = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly wohnungenService: WohnungenService,
    private readonly translate: TranslateService
  ) {}

  ngOnInit(): void {
    this.loadWohnung();
  }

  loadWohnung(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';

    if (!id) {
      this.loading = false;
      this.errorMessage = 'معرّف العقار غير موجود.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.wohnungenService.getWohnung(id).subscribe({
      next: wohnung => {
        this.wohnung = wohnung;
        this.currentIndex = 0;
        this.loading = false;
      },
      error: err => {
        console.error('Fehler beim Laden der Wohnung:', err);
        this.loading = false;
        this.errorMessage = 'تعذر تحميل تفاصيل العقار. تحقق من الاتصال ثم حاول مرة أخرى.';
      }
    });
  }

  getCurrentImageUrl(): string {
    if (!this.wohnung?.Bilder?.length) {
      return this.fallbackImage;
    }

    return this.wohnung.Bilder[this.currentIndex]?.Url || this.fallbackImage;
  }

  getCurrentImageAlt(): string {
    return this.wohnung?.Bilder?.[this.currentIndex]?.AltText || this.wohnung?.Titel || 'صورة العقار';
  }

  hasImages(): boolean {
    return !!this.wohnung?.Bilder?.length;
  }

  getFormattedPrice(value: number | null | undefined): string {
    if (!value) {
      return '—';
    }

    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency',
        currency: 'SYP',
        maximumFractionDigits: 0
      }).format(value);
    } catch {
      return `${value.toLocaleString('ar')} SYP`;
    }
  }

  getSafeText(value: unknown, fallback = '—'): string {
    const text = value === null || value === undefined ? '' : String(value).trim();
    return text || fallback;
  }

  hasExtras(w: Wohnung): boolean {
    return !!(w.Balkon || w.Aufzug || w.Stellplatz);
  }

  prev(): void {
    if (this.wohnung?.Bilder && this.currentIndex > 0) {
      this.currentIndex--;
    }
  }

  next(): void {
    if (this.wohnung?.Bilder && this.currentIndex < this.wohnung.Bilder.length - 1) {
      this.currentIndex++;
    }
  }

  dragStart(event: MouseEvent | TouchEvent): void {
    this.isDragging = true;
    this.startX = event instanceof MouseEvent ? event.pageX : event.touches[0].clientX;
  }

  dragMove(event: MouseEvent | TouchEvent): void {
    if (!this.isDragging) {
      return;
    }

    this.currentX = event instanceof MouseEvent ? event.pageX : event.touches[0].clientX;
  }

  dragEnd(): void {
    if (!this.isDragging) {
      return;
    }

    this.isDragging = false;
    const diff = this.currentX - this.startX;

    if (diff > 70) {
      this.isRTL ? this.next() : this.prev();
    } else if (diff < -70) {
      this.isRTL ? this.prev() : this.next();
    }
  }

  openModal(): void {
    if (this.hasImages()) {
      this.modalOpen = true;
    }
  }

  closeModal(): void {
    this.modalOpen = false;
  }

  get isRTL(): boolean {
    return this.translate.currentLang === 'ar' || document.documentElement.dir === 'rtl';
  }
}
