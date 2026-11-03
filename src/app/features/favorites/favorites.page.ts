// =====================================================================
// ✅ FIX #9+15 – favorites.page.ts
// المشكلة #9: استخدام signal<any[]> – لا TypeScript Safety
// المشكلة #15: غياب OnPush Change Detection
// الحل: تعريف interface واضح + OnPush
// =====================================================================
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { FavoritesApiService } from '../../core/api/favorites-api.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { FavoriteToggleButtonComponent } from '../../shared/ui/favorite-toggle-button.component';
import { ReportListingButtonComponent } from '../../shared/ui/report-listing-button.component';
import { uiNumberLocale } from '../../core/i18n/ui-language';

// ✅ FIX #9: Interface محددة بدلاً من any
export interface FavoriteItem {
  id?: string;
  Id?: string;
  propertyId?: string;
  PropertyId?: string;

  // حقول مباشرة (إذا كان Backend يُرجع البيانات مدمجة)
  title?: string;
  Title?: string;
  city?: string;
  City?: string;
  coldRent?: number;
  ColdRent?: number;
  warmRent?: number;
  WarmRent?: number;
  purchasePrice?: number;
  PurchasePrice?: number;
  currencyCode?: string;
  CurrencyCode?: string;
  mainImageUrl?: string;
  MainImageUrl?: string;
  images?: FavoriteImage[];
  Images?: FavoriteImage[];

  // إذا كان Backend يُرجع nested object
  property?: FavoritePropertyNested;
  Property?: FavoritePropertyNested;
}

interface FavoriteImage {
  url?: string;
  Url?: string;
  isMain?: boolean;
  IsMain?: boolean;
}

interface FavoritePropertyNested {
  id?: string;
  Id?: string;
  title?: string;
  Title?: string;
  city?: string;
  City?: string;
  coldRent?: number;
  ColdRent?: number;
  warmRent?: number;
  WarmRent?: number;
  purchasePrice?: number;
  PurchasePrice?: number;
  currencyCode?: string;
  CurrencyCode?: string;
  mainImageUrl?: string;
  MainImageUrl?: string;
  images?: FavoriteImage[];
  Images?: FavoriteImage[];
}

@Component({
  selector: 'app-favorites-page',
  standalone: true,
  // ✅ FIX #15: OnPush لتحسين الأداء مع Signals
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    EmptyStateComponent,
    LoadingSpinnerComponent,
    ImageFallbackDirective,
    FavoriteToggleButtonComponent,
    ReportListingButtonComponent
  ],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'FAVORITES.TITLE' | translate }}</h1>
        <p>{{ 'FAVORITES.SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner
        *ngIf="loading()"
        [label]="'COMMON.LOADING' | translate">
      </app-loading-spinner>

      <div class="state-card error"
           *ngIf="!loading() && error()"
           role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>{{ error() }}</p>
        <button type="button" (click)="load()">
          {{ 'COMMON.RETRY' | translate }}
        </button>
      </div>

      <app-empty-state
        *ngIf="!loading() && favorites().length === 0 && !error()"
        icon="♡"
        [title]="'FAVORITES.EMPTY_TITLE' | translate"
        [message]="'FAVORITES.EMPTY_MESSAGE' | translate">
      </app-empty-state>

      <div class="favorites-grid"
           *ngIf="!loading() && favorites().length > 0 && !error()">
        <article
          class="card"
          *ngFor="let favorite of favorites(); trackBy: trackById">
          <div class="thumb-wrap">
            <img
              class="thumb"
              [src]="getImage(favorite)"
              [alt]="getTitle(favorite)"
              loading="lazy"
              appImageFallback="/images/no-image.svg"
            />
            <!-- The same shared heart as everywhere else: it is red here (every card on this page is
                 a favorite) and clicking it removes the property from the favorites. -->
            <app-favorite-toggle-button
              *ngIf="getPropertyId(favorite) as id"
              class="card-fav"
              [propertyId]="id"
              (changed)="onFavoriteChanged(id, $event)"
            ></app-favorite-toggle-button>
            <app-report-listing-button
              *ngIf="getPropertyId(favorite) as id"
              class="card-report"
              variant="compact"
              [propertyId]="id"
              [listingTitle]="getTitle(favorite)"
            ></app-report-listing-button>
          </div>

          <div class="card-body">
            <h2 class="line-clamp-2">{{ getTitle(favorite) }}</h2>
            <p class="line-clamp-1">📍 {{ getSubtitle(favorite) }}</p>
            <strong>{{ getPrice(favorite) }}</strong>
            <a *ngIf="getPropertyId(favorite) as id"
               [routerLink]="['/properties', id]">
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
    .page-header p { margin: 0; color: var(--gray-500); line-height: 1.7; }

    .favorites-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .card, .state-card {
      background: var(--surface);
      border-radius: 16px;
      box-shadow: var(--shadow-md);
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .thumb-wrap { position: relative; }
    .thumb {
      display: block;
      width: 100%;
      aspect-ratio: 16/10;
      object-fit: cover;
      background: var(--gray-100);
    }
    .card-report {
      display: block;
      line-height: 0;
      position: absolute;
      bottom: .6rem;
      inset-inline-end: .6rem;
      z-index: 1;
    }
    .card-fav {
      --icon-btn-size: 40px;
      display: block;
      line-height: 0;
      position: absolute;
      top: .6rem;
      inset-inline-end: .6rem;
      z-index: 1;
    }
    .card-body { display: grid; gap: .55rem; padding: 1rem; }
    h2, p { margin: 0; color: var(--gray-800); }
    p { color: var(--gray-500); line-height: 1.6; }
    strong { color: var(--badge-rent-text); overflow-wrap: anywhere; }
    a { width: fit-content; color: var(--primary-text); font-weight: 700; text-decoration: none; }
    a:hover { text-decoration: underline; }

    .state-card {
      display: flex;
      align-items: center;
      gap: .75rem;
      padding: 1rem;
      color: var(--danger-text);
      background: var(--danger-soft);
      border-color: rgba(220,38,38,.2);
    }
    .state-card p { flex: 1; color: inherit; }
    .state-card button {
      border: 0;
      background: var(--danger-solid);
      color: #fff;
      border-radius: 10px;
      padding: .6rem .9rem;
      cursor: pointer;
    }

    @media (min-width: 768px) {
      .favorites-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (min-width: 1024px) {
      .favorites-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
  `]
})
export class FavoritesPage {
  private readonly favoritesApi = inject(FavoritesApiService);

  // ✅ FIX #9: نوع محدد بدلاً من any[]
  readonly favorites = signal<FavoriteItem[]>([]);
  readonly loading   = signal(true);
  readonly error     = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.favoritesApi.getFavorites().subscribe({
      next: items => {
        this.favorites.set((items as FavoriteItem[]) ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('يجب تسجيل الدخول لعرض المفضلة أو تعذر تحميل البيانات.');
        this.loading.set(false);
      }
    });
  }

  /** The heart on a card was clicked: once the server confirmed the removal the card goes away at once. */
  onFavoriteChanged(propertyId: string, isFavorite: boolean): void {
    if (isFavorite) return;
    this.favorites.update(items => items.filter(item => this.getPropertyId(item) !== propertyId));
  }

  // ✅ FIX #9: المعامل نوعه FavoriteItem بدلاً من any
  trackById(index: number, item: FavoriteItem): string {
    const prop = item?.property ?? item?.Property;
    return String(
      item?.id ?? item?.Id ??
      item?.propertyId ?? item?.PropertyId ??
      prop?.id ?? prop?.Id ??
      index
    );
  }

  getTitle(item: FavoriteItem): string {
    const prop = item?.property ?? item?.Property;
    return String(
      item?.title ?? item?.Title ??
      prop?.title ?? prop?.Title ??
      'عقار بدون عنوان'
    );
  }

  getSubtitle(item: FavoriteItem): string {
    const prop = item?.property ?? item?.Property;
    return String(
      item?.city ?? item?.City ??
      prop?.city ?? prop?.City ??
      'الموقع غير محدد'
    );
  }

  getImage(item: FavoriteItem): string {
    const prop   = item?.property ?? item?.Property ?? item;
    const rawImages = prop?.images ?? prop?.Images ?? [];
    const images = Array.isArray(rawImages) ? rawImages : [];
    const image  = images.find(img => img?.isMain || img?.IsMain) ?? images[0];
    return (
      image?.url ?? image?.Url ??
      prop?.mainImageUrl ?? prop?.MainImageUrl ??
      '/images/no-image.svg'
    );
  }

  getPrice(item: FavoriteItem): string {
    const prop     = item?.property ?? item?.Property ?? item;
    const price    =
      prop?.purchasePrice ?? prop?.PurchasePrice ??
      prop?.warmRent      ?? prop?.WarmRent      ??
      prop?.coldRent      ?? prop?.ColdRent;
    const currency = prop?.currencyCode ?? prop?.CurrencyCode ?? 'SYP';

    if (!price) return 'السعر غير محدد';

    try {
      return new Intl.NumberFormat(uiNumberLocale(), {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
      }).format(Number(price));
    } catch {
      return `${Number(price).toLocaleString(uiNumberLocale())} ${currency}`;
    }
  }

  getPropertyId(item: FavoriteItem): string | null {
    const prop = item?.property ?? item?.Property;
    const id   =
      item?.propertyId ?? item?.PropertyId ??
      prop?.id         ?? prop?.Id;
    return id ? String(id) : null;
  }
}
