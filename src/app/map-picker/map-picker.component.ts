import {
  Component,
  AfterViewInit,
  ElementRef,
  OnChanges,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import * as L from 'leaflet';
import { LangCode } from '../core/services/language.service';

/**
 * Basemap tiles. CARTO's free "light_all" tiles now answer every request with an
 * "API KEY REQUIRED" image, so the picker showed that text instead of a map. OpenStreetMap's
 * standard layer needs no key and labels places in their local language (Arabic in Syria).
 * Its tile usage policy (https://operations.osmfoundation.org/policies/tiles/) is meant for light
 * traffic; if the app outgrows it, switch this one constant to a keyed provider.
 */
export const MAP_TILE_LAYER = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
} as const;

@Component({
  selector: 'app-map-picker',
  standalone: true,
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss']
})
export class MapPickerComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input() lang: LangCode = 'ar';
  @Input() center?: { lat: number; lng: number; zoom?: number };

  /**
   * Optional pin controlled by the parent (e.g. the saved location of a listing being edited, or a
   * GPS fix). Setting it places the marker without emitting `locationChange`; clicking or dragging
   * still emits. `null` clears the pin. Parents that never bind it behave exactly as before.
   */
  @Input() marker?: { lat: number; lng: number } | null;

  @Output() locationChange = new EventEmitter<{
    lat: number;
    lng: number;
  }>();

  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLElement>;

  private map!: L.Map;
  private pin?: L.Marker;
  private tileLayer?: L.TileLayer;

  ngAfterViewInit(): void {
    this.initMap();
    this.syncMarker(false);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['marker'] && this.map) {
      this.syncMarker(true);
    }
  }

  private initMap(): void {
    const start = this.marker ?? this.center;
    const lat = start?.lat ?? 33.5138;
    const lng = start?.lng ?? 36.2765;
    const zoom = this.marker ? 15 : (this.center?.zoom ?? 13);

    this.map = L.map(this.canvas.nativeElement).setView([lat, lng], zoom);
    this.loadTiles();

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setMarker(e.latlng.lat, e.latlng.lng);
    });
  }

  private loadTiles(): void {
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    this.tileLayer = L.tileLayer(MAP_TILE_LAYER.url, { ...MAP_TILE_LAYER.options });

    this.tileLayer.addTo(this.map);
  }

  /** Mirrors the parent-controlled `marker` input onto the map without echoing it back. */
  private syncMarker(pan: boolean): void {
    if (!this.marker) {
      if (this.pin) {
        this.pin.remove();
        this.pin = undefined;
      }
      return;
    }

    const { lat, lng } = this.marker;
    this.placeMarker(lat, lng);

    // Bring a programmatic pin (GPS fix, saved location) into view; leave the view alone when the
    // user just clicked inside it, so the map does not jump under their finger.
    if (pan && !this.map.getBounds().contains([lat, lng])) {
      this.map.setView([lat, lng], Math.max(this.map.getZoom(), 15));
    }
  }

  private placeMarker(lat: number, lng: number): void {
    if (!this.pin) {
      this.pin = L.marker([lat, lng], { draggable: true }).addTo(this.map);

      this.pin.on('dragend', () => {
        const pos = this.pin!.getLatLng();
        this.locationChange.emit({ lat: pos.lat, lng: pos.lng });
      });
    } else {
      this.pin.setLatLng([lat, lng]);
    }
  }

  private setMarker(lat: number, lng: number): void {
    this.placeMarker(lat, lng);
    this.locationChange.emit({ lat, lng });
  }

  updateCenter(lat: number, lng: number, zoom = 13) {
    this.map.setView([lat, lng], zoom);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
