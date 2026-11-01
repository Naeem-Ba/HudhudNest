import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { LangCode } from '../core/services/language.service';
import { isValidCoordinates } from '../core/models/property-location';

/** OpenStreetMap tiles need no key and include local place labels. */
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
  imports: [CommonModule],
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss']
})
export class MapPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('mapElement', { static: true }) private mapElement!: ElementRef<HTMLDivElement>;

  @Input() lang: LangCode = 'ar';
  @Input() center?: { lat: number; lng: number; zoom?: number };
  @Input() interactive = true;
  @Input() enableLocate = true;
  /** Parent controlled marker for saved locations and GPS fixes. */
  @Input() marker?: { lat: number; lng: number } | null;

  @Output() locationChange = new EventEmitter<{ lat: number; lng: number }>();

  readonly tilesUnavailable = signal(false);
  readonly locationMessage = signal('');

  private map?: L.Map;
  private pin?: L.Marker;
  private tileLayer?: L.TileLayer;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.initMap();
    if (this.marker !== undefined) {
      this.syncControlledMarker(false);
    } else {
      this.applyCenter();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;

    if (changes['marker']) {
      if (this.marker === undefined) this.applyCenter();
      else this.syncControlledMarker(true);
    } else if (changes['center'] && this.marker === undefined) {
      this.applyCenter();
    }
  }

  private initMap(): void {
    const initial = this.marker ?? this.center;
    const hasInitial = !!initial && isValidCoordinates(initial.lat, initial.lng);
    const lat = hasInitial ? initial!.lat : 33.5138;
    const lng = hasInitial ? initial!.lng : 36.2765;
    const zoom = this.marker ? 15 : (this.center?.zoom ?? (hasInitial ? 15 : 6));
    const map = L.map(this.mapElement.nativeElement, {
      // Added below with titles in the page language (Leaflet's own are English only).
      zoomControl: false,
      dragging: this.interactive,
      touchZoom: this.interactive,
      scrollWheelZoom: false,
      doubleClickZoom: this.interactive,
      boxZoom: this.interactive,
      keyboard: this.interactive
    }).setView([lat, lng], zoom);

    const controls = this.controlTitles();
    L.control.zoom({ zoomInTitle: controls.zoomIn, zoomOutTitle: controls.zoomOut }).addTo(map);
    // The default prefix is a link titled "A JavaScript library for interactive maps" (English).
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener" title="Leaflet">Leaflet</a>');

    this.map = map;
    this.tileLayer = L.tileLayer(MAP_TILE_LAYER.url, { ...MAP_TILE_LAYER.options });
    this.tileLayer.on('tileerror', () => this.tilesUnavailable.set(true));
    this.tileLayer.on('tileload', () => this.tilesUnavailable.set(false));
    this.tileLayer.addTo(map);

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.interactive) this.setMarker(event.latlng.lat, event.latlng.lng, true);
    });

    this.resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    this.resizeObserver.observe(this.mapElement.nativeElement);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  private applyCenter(): void {
    const map = this.map;
    if (!map) return;

    if (this.center && isValidCoordinates(this.center.lat, this.center.lng)) {
      map.setView([this.center.lat, this.center.lng], this.center.zoom ?? 15);
      this.setMarker(this.center.lat, this.center.lng, false);
      return;
    }

    this.pin?.remove();
    this.pin = undefined;
    // Keep the initial camera position separate from a user-selected property location.
    map.setView([33.5138, 36.2765], 6);
  }

  private syncControlledMarker(pan: boolean): void {
    const map = this.map;
    if (!map) return;

    if (!this.marker || !isValidCoordinates(this.marker.lat, this.marker.lng)) {
      this.pin?.remove();
      this.pin = undefined;
      return;
    }

    this.placeMarker(this.marker.lat, this.marker.lng);
    if (pan && !map.getBounds().contains([this.marker.lat, this.marker.lng])) {
      map.setView([this.marker.lat, this.marker.lng], Math.max(map.getZoom(), 15));
    }
  }

  private placeMarker(lat: number, lng: number): void {
    if (!this.map || !isValidCoordinates(lat, lng)) return;

    if (!this.pin) {
      this.pin = L.marker([lat, lng], { draggable: this.interactive }).addTo(this.map);
      this.pin.on('dragend', () => {
        const position = this.pin?.getLatLng();
        if (position && isValidCoordinates(position.lat, position.lng)) {
          this.locationChange.emit({ lat: position.lat, lng: position.lng });
        }
      });
    } else {
      this.pin.setLatLng([lat, lng]);
      this.pin.dragging?.[this.interactive ? 'enable' : 'disable']();
    }
  }

  private setMarker(lat: number, lng: number, emit: boolean): void {
    if (!this.map || !isValidCoordinates(lat, lng)) return;
    this.placeMarker(lat, lng);
    if (emit) this.locationChange.emit({ lat, lng });
  }

  updateCenter(lat: number, lng: number, zoom = 13): void {
    if (this.map && isValidCoordinates(lat, lng)) {
      this.map.setView([lat, lng], zoom);
    }
  }

  locateCurrentPosition(): void {
    this.locationMessage.set('');
    if (!navigator.geolocation) {
      this.locationMessage.set(this.message('locationUnavailable'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        if (!isValidCoordinates(latitude, longitude)) {
          this.locationMessage.set(this.message('locationUnavailable'));
          return;
        }

        this.map?.setView([latitude, longitude], 15);
        this.setMarker(latitude, longitude, true);
      },
      error => this.locationMessage.set(this.message(
        error.code === error.PERMISSION_DENIED ? 'locationDenied' : 'locationUnavailable'
      )),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  private controlTitles(): { zoomIn: string; zoomOut: string } {
    const titles = {
      ar: { zoomIn: 'تكبير', zoomOut: 'تصغير' },
      de: { zoomIn: 'Vergrößern', zoomOut: 'Verkleinern' },
      en: { zoomIn: 'Zoom in', zoomOut: 'Zoom out' }
    } as const;
    return titles[this.lang] ?? titles.ar;
  }

  private message(key: 'locationDenied' | 'locationUnavailable'): string {
    const messages = {
      ar: {
        locationDenied: 'لم يُسمح بالوصول إلى موقع الجهاز. يمكنك اختيار موقع العقار يدويًا على الخريطة.',
        locationUnavailable: 'تعذر تحديد موقع الجهاز. يمكنك اختيار موقع العقار يدويًا على الخريطة.'
      },
      de: {
        locationDenied: 'Der Standortzugriff wurde verweigert. Sie können den Immobilienstandort manuell auf der Karte auswählen.',
        locationUnavailable: 'Der Gerätestandort ist nicht verfügbar. Sie können den Immobilienstandort manuell auf der Karte auswählen.'
      },
      en: {
        locationDenied: 'Location access was denied. You can select the property location manually on the map.',
        locationUnavailable: 'The device location is unavailable. You can select the property location manually on the map.'
      }
    } as const;
    return messages[this.lang][key];
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
    this.map = undefined;
  }
}
