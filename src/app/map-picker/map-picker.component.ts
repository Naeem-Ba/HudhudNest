import {
  Component,
  AfterViewInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter
} from '@angular/core';
import * as L from 'leaflet';
import { LangCode } from '../core/services/language.service';

@Component({
  selector: 'app-map-picker',
  standalone: true,
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss']
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {

  @Input() lang: LangCode = 'ar';
  @Input() center?: { lat: number; lng: number; zoom?: number };

  @Output() locationChange = new EventEmitter<{
    lat: number;
    lng: number;
  }>();

  private map!: L.Map;
  private marker?: L.Marker;
  private tileLayer?: L.TileLayer;

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    const lat = this.center?.lat ?? 33.5138;
    const lng = this.center?.lng ?? 36.2765;
    const zoom = this.center?.zoom ?? 13;

    this.map = L.map('map').setView([lat, lng], zoom);
    this.loadTiles();

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setMarker(e.latlng.lat, e.latlng.lng);
    });
  }

  private loadTiles(): void {
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    this.tileLayer = L.tileLayer(this.getTileUrl(), {
      attribution: '© OpenStreetMap contributors'
    });

    this.tileLayer.addTo(this.map);
  }

  private getTileUrl(): string {
    // خرائط تدعم العربية بشكل أفضل
    return 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
  }

  private setMarker(lat: number, lng: number): void {
    if (!this.marker) {
      this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);

      this.marker.on('dragend', () => {
        const pos = this.marker!.getLatLng();
        this.locationChange.emit({ lat: pos.lat, lng: pos.lng });
      });
    } else {
      this.marker.setLatLng([lat, lng]);
    }

    this.locationChange.emit({ lat, lng });
  }

  updateCenter(lat: number, lng: number, zoom = 13) {
    this.map.setView([lat, lng], zoom);
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }
}
