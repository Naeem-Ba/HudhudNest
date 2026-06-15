import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FavoritesApiService } from '../../core/services/favorites-api.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, EmptyStateComponent, LoadingSpinnerComponent, ImageFallbackDirective],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'FAVORITES.TITLE' | translate }}</h1>
        <p>{{ 'FAVORITES.SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state-card error" *ngIf="!loading() && error()" role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>{{ error() }}</p>
        <button type="button" (click)="load()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <app-empty-state
        *ngIf="!loading() && favorites().length === 0 && !error()"
        icon="♡"
        [title]="'FAVORITES.EMPTY_TITLE' | translate"
        [message]="'FAVORITES.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="favorites-grid" *ngIf="!loading() && favorites().length > 0 && !error()">
        <article class="card" *ngFor="let favorite of favorites(); trackBy: trackById">
          <img
            class="thumb"
            [src]="getImage(favorite)"
            [alt]="getTitle(favorite)"
            loading="lazy"
            appImageFallback="/images/no-image.svg"
          />

          <div class="card-body">
            <h2 class="line-clamp-2">{{ getTitle(favorite) }}</h2>
            <p class="line-clamp-1">📍 {{ getSubtitle(favorite) }}</p>
            <strong>{{ getPrice(favorite) }}</strong>
            <a *ngIf="getPropertyId(favorite) as id" [routerLink]="['/wohnungen', id]">
              {{ 'APARTMENTS.DETAILS' | translate }}
            </a>
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0 0 .35rem; font-size: clamp(1.6rem, 3vw, 2.2rem); }
    .page-header p { margin: 0; color: #64748b; line-height: 1.7; }

    .favorites-grid { display: grid; grid-template-columns: 1fr; gap: 1rem; }
    .card,.state-card { background:#fff;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,.08);border:1px solid #e2e8f0;overflow:hidden; }
    .thumb { width:100%; aspect-ratio:16/10; object-fit:cover; background:#f1f5f9; }
    .card-body { display:grid; gap:.55rem; padding:1rem; }
    h2,p { margin:0; }
    p { color:#64748b; line-height:1.6; }
    strong { color:#0f766e; overflow-wrap:anywhere; }
    a { width:fit-content; color:#2563eb; font-weight:700; text-decoration:none; }
    a:hover { text-decoration:underline; }

    .state-card { display:flex;align-items:center;gap:.75rem;padding:1rem;color:#b91c1c;background:#fff7f7;border-color:#fecaca; }
    .state-card p { flex:1; color:inherit; }
    .state-card button { border:0;background:#dc2626;color:#fff;border-radius:10px;padding:.6rem .9rem;cursor:pointer; }

    @media (min-width: 768px) { .favorites-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 1024px) { .favorites-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  `]
})
export class FavoritesPage {
  private readonly favoritesApi = inject(FavoritesApiService);

  readonly favorites = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.favoritesApi.getFavorites().subscribe({
      next: items => {
        this.favorites.set(items as any[] ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('يجب تسجيل الدخول لعرض المفضلة أو تعذر تحميل البيانات.');
        this.loading.set(false);
      }
    });
  }

  trackById(index: number, item: any): string {
    return String(item?.id ?? item?.Id ?? item?.propertyId ?? item?.PropertyId ?? index);
  }

  getTitle(item: any): string {
    return String(item?.title ?? item?.Title ?? item?.property?.title ?? item?.Property?.Title ?? 'عقار بدون عنوان');
  }

  getSubtitle(item: any): string {
    return String(item?.city ?? item?.City ?? item?.property?.city ?? item?.Property?.City ?? 'الموقع غير محدد');
  }

  getImage(item: any): string {
    const property = item?.property ?? item?.Property ?? item;
    const rawImages = property?.images ?? property?.Images ?? [];
    const images = Array.isArray(rawImages) ? rawImages : [];
    const image = images.find((img: any) => img?.isMain || img?.IsMain) ?? images[0];
    return image?.url ?? image?.Url ?? property?.mainImageUrl ?? property?.MainImageUrl ?? '/images/no-image.svg';
  }

  getPrice(item: any): string {
    const property = item?.property ?? item?.Property ?? item;
    const price = property?.purchasePrice ?? property?.PurchasePrice ?? property?.warmRent ?? property?.WarmRent ?? property?.coldRent ?? property?.ColdRent;
    const currency = property?.currencyCode ?? property?.CurrencyCode ?? 'SYP';

    if (!price) {
      return 'السعر غير محدد';
    }

    try {
      return new Intl.NumberFormat('ar', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(price));
    } catch {
      return `${Number(price).toLocaleString('ar')} ${currency}`;
    }
  }

  getPropertyId(item: any): string | null {
    const property = item?.property ?? item?.Property;
    const id = item?.propertyId ?? item?.PropertyId ?? property?.id ?? property?.Id;
    return id ? String(id) : null;
  }
}
