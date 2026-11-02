import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from './backend-api.service';

export interface MapPoint {
  id: string; title: string; latitude: number; longitude: number; isLocationApproximate: boolean;
  listingType: 'ForRent' | 'ForSale' | 'ForRentAndSale' | string; purchasePrice: number | null; rent: number | null;
  currencyCode: string; rooms: number | null; area: number | null; mainImageUrl: string | null; isFeatured: boolean;
}
export interface MapCluster { latitude: number; longitude: number; count: number; }
export interface MapResult { mode: 'points' | 'clusters'; total: number; points: MapPoint[]; clusters: MapCluster[]; }

export interface MapBox { minLat: number; minLng: number; maxLat: number; maxLng: number; zoom: number; }
export interface MapFilters { listingType?: 'ForRent' | 'ForSale' | null; propertyTypeId?: number | null; minRooms?: number | null; }

/** Rounds the box outward to 3 decimals (about 100 m) so small pans hit the same cached response. */
export function roundBox(box: MapBox): MapBox {
  const down = (v: number) => Math.floor(v * 1000) / 1000;
  const up = (v: number) => Math.ceil(v * 1000) / 1000;
  return {
    minLat: Math.max(-90, down(box.minLat)), minLng: Math.max(-180, down(box.minLng)),
    maxLat: Math.min(90, up(box.maxLat)), maxLng: Math.min(180, up(box.maxLng)),
    zoom: Math.min(20, Math.max(1, Math.round(box.zoom)))
  };
}

@Injectable({ providedIn: 'root' })
export class PropertyMapApiService {
  private readonly api = inject(BackendApiService);

  /** Growth engine P8: points (few listings) or clusters (many) inside the box. */
  load(box: MapBox, filters: MapFilters = {}): Observable<MapResult> {
    const b = roundBox(box);
    return this.api.get<MapResult>('/properties/map', {
      minLat: b.minLat, minLng: b.minLng, maxLat: b.maxLat, maxLng: b.maxLng, zoom: b.zoom,
      listingType: filters.listingType ?? null, propertyTypeId: filters.propertyTypeId ?? null, minRooms: filters.minRooms ?? null
    });
  }
}
