import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PropertyApiService } from '../../../core/services/property-api.service';
import { Property } from '../../../core/models/property.model';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { SkeletonCardGridComponent } from '../../../shared/ui/skeleton-card-grid.component';
import { ImageFallbackDirective } from '../../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-property-list-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, EmptyStateComponent, SkeletonCardGridComponent, ImageFallbackDirective],
  template: `
    <section class="properties-page">
      <header class="page-header">
        <span class="eyebrow">{{ 'PROPERTY_LIST.EYEBROW' | translate }}</span>
        <h1>{{ 'PROPERTY_LIST.TITLE' | translate }}</h1>
        <p>{{ 'PROPERTY_LIST.SUBTITLE' | translate }}</p>
      </header>

      <app-skeleton-card-grid *ngIf="loading()" [count]="6"></app-skeleton-card-grid>

      <app-empty-state
        *ngIf="!loading() && !error() && properties().length === 0"
        icon="🏠"
        [title]="'PROPERTY_LIST.EMPTY_TITLE' | translate"
        [message]="'PROPERTY_LIST.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="state-card error" *ngIf="!loading() && error()">
        <span aria-hidden="true">⚠️</span>
        <p>{{ error() }}</p>
        <button type="button" (click)="loadProperties()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <div class="properties-grid" *ngIf="!loading() && !error() && properties().length > 0">
        <article class="property-card" *ngFor="let property of properties(); trackBy: trackById">
          <div class="image-wrapper">
            <img
              [src]="getMainImage(property)"
              [alt]="getTitle(property)"
              loading="lazy"
              appImageFallback="/images/no-image.svg"
            />
          </div>

          <div class="card-body">
            <h2 class="line-clamp-2">{{ getTitle(property) }}</h2>
            <p class="location line-clamp-1">📍 {{ getLocation(property) }}</p>
            <p class="description line-clamp-3">{{ getDescription(property) }}</p>

            <div class="meta-row">
              <span *ngIf="getArea(property)">{{ getArea(property) }} m²</span>
              <span *ngIf="getRooms(property)">{{ getRooms(property) }} {{ 'PROPERTY_LIST.ROOMS' | translate }}</span>
            </div>

            <strong class="price">{{ getPrice(property) }}</strong>
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .properties-page {
      padding: clamp(1rem, 3vw, 2rem);
    }

    .page-header {
      margin-bottom: 1.5rem;
      max-width: 780px;
    }

    .eyebrow {
      display: inline-flex;
      margin-bottom: .45rem;
      color: #2563eb;
      font-weight: 700;
      font-size: .9rem;
    }

    .page-header h1 {
      margin: 0 0 .5rem;
      font-size: clamp(1.7rem, 4vw, 2.6rem);
    }

    .page-header p {
      margin: 0;
      color: #64748b;
      line-height: 1.7;
    }

    .properties-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .property-card,
    .state-card {
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, .08);
    }

    .property-card {
      overflow: hidden;
      border: 1px solid #e2e8f0;
      transition: transform .18s ease, box-shadow .18s ease;
    }

    .property-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 18px 42px rgba(15, 23, 42, .12);
    }

    .image-wrapper {
      aspect-ratio: 16 / 10;
      overflow: hidden;
      background: #f1f5f9;
    }

    .image-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .card-body {
      display: grid;
      gap: .65rem;
      padding: 1rem;
    }

    h2 {
      margin: 0;
      font-size: 1.1rem;
      line-height: 1.45;
    }

    .location,
    .description {
      margin: 0;
      color: #64748b;
      line-height: 1.6;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: .5rem;
    }

    .meta-row span {
      background: #eef2ff;
      color: #3730a3;
      padding: .35rem .55rem;
      border-radius: 999px;
      font-size: .85rem;
    }

    .price {
      color: #0f766e;
      font-size: 1.1rem;
    }

    .state-card {
      display: flex;
      align-items: center;
      gap: .75rem;
      padding: 1rem;
      color: #b91c1c;
      border: 1px solid #fecaca;
      background: #fff7f7;
    }

    .state-card p {
      margin: 0;
      flex: 1;
    }

    .state-card button {
      border: 0;
      background: #dc2626;
      color: #fff;
      border-radius: 10px;
      padding: .6rem .9rem;
      cursor: pointer;
    }

    @media (min-width: 768px) {
      .properties-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (min-width: 1024px) {
      .properties-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  `]
})
export class PropertyListPage {
  private readonly propertyApi = inject(PropertyApiService);

  readonly properties = signal<Property[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.loadProperties();
  }

  loadProperties(): void {
    this.loading.set(true);
    this.error.set('');

    this.propertyApi.getProperties().subscribe({
      next: properties => {
        this.properties.set(properties ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('تعذر تحميل العقارات. تحقق من اتصال الخادم ثم حاول مرة أخرى.');
        this.loading.set(false);
      }
    });
  }

  trackById(_: number, property: Property): string {
    return String((property as any).id ?? (property as any).Id ?? _);
  }

  getTitle(property: Property): string {
    const value = (property as any).title ?? (property as any).Title;
    return value ? String(value) : 'عقار بدون عنوان';
  }

  getDescription(property: Property): string {
    const value = (property as any).description ?? (property as any).Description;
    return value ? String(value) : 'لا يوجد وصف متاح لهذا العقار.';
  }

  getLocation(property: Property): string {
    const city = (property as any).city ?? (property as any).City;
    const street = (property as any).street ?? (property as any).Street;
    const postalCode = (property as any).postalCode ?? (property as any).PostalCode;
    return [street, city, postalCode].filter(Boolean).join('، ') || 'الموقع غير محدد';
  }

  getMainImage(property: Property): string {
    const rawImages = (property as any).images ?? (property as any).Images ?? [];
    const images = Array.isArray(rawImages) ? rawImages : [];
    const mainImage = images.find((image: any) => image?.isMain || image?.IsMain) ?? images[0];
    return mainImage?.url ?? mainImage?.Url ?? (property as any).mainImageUrl ?? (property as any).MainImageUrl ?? '/images/no-image.svg';
  }

  getPrice(property: Property): string {
    const value =
      (property as any).purchasePrice ??
      (property as any).PurchasePrice ??
      (property as any).warmRent ??
      (property as any).WarmRent ??
      (property as any).coldRent ??
      (property as any).ColdRent;

    const currency = String((property as any).currencyCode ?? (property as any).CurrencyCode ?? 'SYP');

    if (value === null || value === undefined || value === '') {
      return 'السعر غير محدد';
    }

    try {
      return new Intl.NumberFormat('ar', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(Number(value));
    } catch {
      return `${Number(value).toLocaleString('ar')} ${currency}`;
    }
  }

  getArea(property: Property): number | null {
    const value = (property as any).area ?? (property as any).Area;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  getRooms(property: Property): number | null {
    const value = (property as any).rooms ?? (property as any).Rooms;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }
}
