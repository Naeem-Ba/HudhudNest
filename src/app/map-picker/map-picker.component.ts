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

  @Output() locationChange = new EventEmitter<{ lat: number; lng: number }>();

  readonly tilesUnavailable = signal(false);
  readonly locationMessage = signal('');

  private map?: L.Map;
  private marker?: L.Marker;
  private tileLayer?: L.TileLayer;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['center'] && this.map) {
      this.applyCenter();
    }
  }

  private initMap(): void {
    const map = L.map(this.mapElement.nativeElement, {
      zoomControl: true,
      dragging: this.interactive,
      touchZoom: this.interactive,
      scrollWheelZoom: false,
      doubleClickZoom: this.interactive,
      boxZoom: this.interactive,
      keyboard: this.interactive
    });
    this.map = map;
    this.applyCenter();

    map.on('click', (event: L.LeafletMouseEvent) => {
      if (this.interactive) {
        this.setMarker(event.latlng.lat, event.latlng.lng, true);
      }
    });

    this.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      crossOrigin: true,
      maxZoom: 19
    });
    this.tileLayer.on('tileerror', () => this.tilesUnavailable.set(true));
    this.tileLayer.on('tileload', () => this.tilesUnavailable.set(false));
    this.tileLayer.addTo(map);

    this.resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    this.resizeObserver.observe(this.mapElement.nativeElement);
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }

  private applyCenter(): void {
    const map = this.map;
    if (!map) return;

    if (this.center && isValidCoordinates(this.center.lat, this.center.lng)) {
      const zoom = this.center.zoom ?? 15;
      map.setView([this.center.lat, this.center.lng], zoom);
      this.setMarker(this.center.lat, this.center.lng, false);
      return;
    }

    this.marker?.remove();
    this.marker = undefined;
    // This is only an initial camera position. It is never emitted or saved as a property location.
    map.setView([33.5138, 36.2765], 6);
  }

  private setMarker(lat: number, lng: number, emit: boolean): void {
    if (!this.map || !isValidCoordinates(lat, lng)) return;

    const draggable = this.interactive;
    if (!this.marker) {
      this.marker = L.marker([lat, lng], { draggable }).addTo(this.map);
      this.marker.on('dragend', () => {
        const position = this.marker?.getLatLng();
        if (position && isValidCoordinates(position.lat, position.lng)) {
          this.locationChange.emit({ lat: position.lat, lng: position.lng });
        }
      });
    } else {
      this.marker.setLatLng([lat, lng]);
      this.marker.dragging?.[draggable ? 'enable' : 'disable']();
    }

    if (emit) this.locationChange.emit({ lat, lng });
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
        // Explicit button action only: current device location remains a separate user action.
        this.setMarker(latitude, longitude, true);
      },
      error => {
        this.locationMessage.set(error.code === error.PERMISSION_DENIED
          ? this.message('locationDenied')
          : this.message('locationUnavailable'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
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
