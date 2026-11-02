import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, debounceTime, switchMap, catchError, of } from 'rxjs';
import * as L from 'leaflet';

import { MapFilters, MapPoint, MapResult, PropertyMapApiService } from '../../core/api/property-map-api.service';
import { MAP_TILE_LAYER } from '../../map-picker/map-picker.component';
import { formatListingPrice } from '../../shared/utils/listing-price';

/**
 * Growth engine P8: browse listings on a map. The server clusters when a box holds more than 300 listings, so
 * the browser draws at most a few hundred markers. Listings whose owner hid the exact spot are drawn as a
 * ~500 m circle, never a pin.
 */
@Component({
  selector: 'app-property-map',
  standalone: true,
  imports: [FormsModule, RouterModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="pm-page">
      <header class="pm-header">
        <h1>{{ 'PROPERTY_MAP.TITLE' | translate }}</h1>
        <div class="pm-filters">
          <label>{{ 'PROPERTY_MAP.TYPE' | translate }}
            <select name="listingType" [(ngModel)]="listingType" (ngModelChange)="refresh()">
              <option [ngValue]="null">{{ 'PROPERTY_MAP.ALL' | translate }}</option>
              <option value="ForRent">{{ 'PROPERTY_MAP.RENT' | translate }}</option>
              <option value="ForSale">{{ 'PROPERTY_MAP.SALE' | translate }}</option>
            </select>
          </label>
          <label>{{ 'PROPERTY_MAP.MIN_ROOMS' | translate }}
            <input type="number" inputmode="numeric" min="0" max="50" name="minRooms" [(ngModel)]="minRooms" (ngModelChange)="refresh()">
          </label>
          <a routerLink="/properties" class="btn btn-link">{{ 'PROPERTY_MAP.LIST_VIEW' | translate }}</a>
        </div>
        <p class="pm-status" role="status" data-testid="pm-status">
          @if (failed()) { {{ 'PROPERTY_MAP.ERROR' | translate }} }
          @else if (result(); as r) {
            {{ (r.mode === 'clusters' ? 'PROPERTY_MAP.ZOOM_IN' : 'PROPERTY_MAP.COUNT') | translate: { count: r.total } }}
          }
        </p>
      </header>
      <div #mapEl class="pm-map" data-testid="pm-map"></div>
      <p class="pm-note">{{ 'PROPERTY_MAP.PRIVACY_NOTE' | translate }}</p>
    </main>
  `,
  styleUrls: ['./property-map.page.scss']
})
export class PropertyMapPage implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) private mapEl!: ElementRef<HTMLDivElement>;

  private readonly api = inject(PropertyMapApiService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly requests = new Subject<void>();

  readonly result = signal<MapResult | null>(null);
  readonly failed = signal(false);

  listingType: MapFilters['listingType'] = null;
  minRooms: number | null = null;

  private map?: L.Map;
  private layer?: L.LayerGroup;

  constructor() {
    this.requests.pipe(
      debounceTime(300),
      switchMap(() => {
        const box = this.box();
        if (!box) return of(null);
        return this.api.load(box, { listingType: this.listingType, minRooms: this.minRooms || null }).pipe(
          catchError(() => { this.failed.set(true); return of(null); }));
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(r => {
      if (!r) return;
      this.failed.set(false);
      this.result.set(r);
      this.draw(r);
    });
  }

  ngAfterViewInit(): void {
    // Syria by default.
    this.map = L.map(this.mapEl.nativeElement, { center: [34.8, 38.5], zoom: 7 });
    L.tileLayer(MAP_TILE_LAYER.url, MAP_TILE_LAYER.options).addTo(this.map);
    this.layer = L.layerGroup().addTo(this.map);
    this.map.on('moveend', () => this.refresh());
    this.refresh();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  refresh(): void {
    this.requests.next();
  }

  private box() {
    if (!this.map) return null;
    const b = this.map.getBounds();
    return { minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast(), zoom: this.map.getZoom() };
  }

  /** Public for tests: draws one marker per point or cluster and returns how many layers were added. */
  draw(r: MapResult): number {
    if (!this.layer || !this.map) return 0;
    this.layer.clearLayers();
    if (r.mode === 'clusters') {
      for (const c of r.clusters) {
        const marker = L.marker([c.latitude, c.longitude], {
          icon: L.divIcon({ className: 'pm-cluster', html: `<span>${c.count}</span>`, iconSize: [40, 40] }),
          keyboard: true, title: String(c.count)
        });
        marker.on('click', () => this.map?.setView([c.latitude, c.longitude], Math.min(18, (this.map?.getZoom() ?? 7) + 2)));
        this.layer.addLayer(marker);
      }
      return r.clusters.length;
    }
    for (const p of r.points) {
      const open = () => this.router.navigate(['/properties', p.id]);
      if (p.isLocationApproximate) {
        const circle = L.circle([p.latitude, p.longitude], { radius: 300, color: '#1d4ed8', weight: 1, fillOpacity: .15 });
        circle.bindTooltip(escapeHtml(this.label(p)));
        circle.on('click', open);
        this.layer.addLayer(circle);
      } else {
        const marker = L.marker([p.latitude, p.longitude], {
          icon: L.divIcon({ className: 'pm-price' + (p.isFeatured ? ' pm-price--featured' : ''), html: `<span>${escapeHtml(this.price(p))}</span>`, iconSize: [90, 28] }),
          keyboard: true, title: p.title
        });
        marker.on('click', open);
        this.layer.addLayer(marker);
      }
    }
    return r.points.length;
  }

  price(p: MapPoint): string {
    const value = this.listingType === 'ForRent' || p.listingType === 'ForRent' ? (p.rent ?? p.purchasePrice) : (p.purchasePrice ?? p.rent);
    return formatListingPrice(value, p.currencyCode);
  }

  private label(p: MapPoint): string {
    return `${p.title} · ${this.price(p)} · ${this.translate.instant('PROPERTY_MAP.APPROXIMATE')}`;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
