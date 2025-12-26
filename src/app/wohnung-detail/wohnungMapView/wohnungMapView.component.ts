import { Component, Input, AfterViewInit } from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-wohnungMapView',
  standalone: true,
  templateUrl: './wohnungMapView.component.html',
  styleUrls: ['./wohnungMapView.component.scss']
})
export class WohnungMapViewComponent implements AfterViewInit {

  @Input({ required: true }) lat!: number;
  @Input({ required: true }) lng!: number;
  @Input() zoom = 16;
  @Input() title?: string;

  private map!: L.Map;
  private marker!: L.Marker;

  isFullscreen = false;

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    this.map = L.map('wohnung-map', {
      center: [this.lat, this.lng],
      zoom: this.zoom,
      zoomControl: true,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.map);

    this.marker = L.marker([this.lat, this.lng]).addTo(this.map);

    if (this.title) {
      this.marker.bindPopup(this.title);
    }
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;

    // Leaflet يحتاج إعادة حساب الحجم
    setTimeout(() => {
      this.map.invalidateSize();
      this.map.setView([this.lat, this.lng], this.zoom);
    }, 200);
  }
}
