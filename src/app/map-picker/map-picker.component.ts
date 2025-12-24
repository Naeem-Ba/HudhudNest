import {
  Component,
  AfterViewInit,
  OnDestroy,
  EventEmitter,
  Output,
  Input
} from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'app-map-picker',
  standalone: true,
  templateUrl: './map-picker.component.html',
  styleUrls: ['./map-picker.component.scss']
})
export class MapPickerComponent implements AfterViewInit, OnDestroy {

  /** لغة الخريطة (مرتبطة بلغة التطبيق) */
  @Input() lang: 'ar' | 'en' | 'de' = 'ar';

  /** الإحداثيات المختارة */
  @Output() locationChange = new EventEmitter<{
    lat: number;
    lng: number;
  }>();

  private map!: L.Map;
  private marker?: L.Marker;
  private tileLayer?: L.TileLayer;

  /** إحداثيات دمشق */
  private readonly DAMASCUS = {
    lat: 33.5138,
    lng: 36.2765
  };

  ngAfterViewInit(): void {
    this.initMap();
  }

  /** تهيئة الخريطة */
  private initMap(): void {
    this.map = L.map('map', {
      center: [this.DAMASCUS.lat, this.DAMASCUS.lng],
      zoom: 13
    });

    this.loadTiles();

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.setMarker(e.latlng.lat, e.latlng.lng);
    });
  }

  /** تحميل البلاطات حسب اللغة */
  private loadTiles(): void {
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
    }

    this.tileLayer = L.tileLayer(this.getTileUrl(), {
      attribution: '© OpenStreetMap contributors'
    });

    this.tileLayer.addTo(this.map);
  }

  /** اختيار مصدر البلاطات */
  private getTileUrl(): string {
    // Carto – مجاني ويدعم العربية جزئياً
    return 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png';
  }

  /** وضع أو تحريك Marker */
  private setMarker(lat: number, lng: number): void {
    if (!this.marker) {
      this.marker = L.marker([lat, lng], {
        draggable: true
      }).addTo(this.map);

      this.marker.on('dragend', () => {
        const pos = this.marker!.getLatLng();
        this.locationChange.emit({
          lat: pos.lat,
          lng: pos.lng
        });
      });
    } else {
      this.marker.setLatLng([lat, lng]);
    }

    this.locationChange.emit({ lat, lng });
  }

  /** تغيير اللغة من الخارج */
  ngOnChanges(): void {
    if (this.map) {
      this.loadTiles();
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.off();
      this.map.remove();
    }
  }
}