import { Component, Input, AfterViewInit, OnDestroy } from '@angular/core';
import * as L from 'leaflet';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LanguageService } from '../../../core/services/language.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-wohnungMapView',
  standalone: true,
  imports: [
    TranslateModule,
  ],
  templateUrl: './wohnungMapView.component.html',
  styleUrls: ['./wohnungMapView.component.scss']
})
export class WohnungMapViewComponent implements AfterViewInit, OnDestroy {

  @Input({ required: true }) lat!: number;
  @Input({ required: true }) lng!: number;
  @Input() zoom = 16;
  @Input() title?: string;

  private map!: L.Map;
  private marker!: L.Marker;
  private langSub?: Subscription;

  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  activeTooltip: string | null = null;
  private longPressTriggered = false;

  isFullscreen = false;
  popupText = '';

  constructor(
    private translate: TranslateService,
    private languageService: LanguageService
  ) {}

  ngAfterViewInit(): void {
    this.initPopupText();
    this.initMap();

    // تحديث الـ Popup عند تغيير اللغة
    this.langSub = this.languageService.currentLang$.subscribe(() => {
      this.initPopupText();
      if (this.marker) {
        this.marker.bindPopup(this.popupText);
      }
    });
  }

  ngOnDestroy(): void {
    this.langSub?.unsubscribe();
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
    }
    this.map?.remove();
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
    this.marker.bindPopup(this.popupText);
  }

  private initPopupText(): void {
    const title = this.title ?? '';
    this.translate
      .get('MAP.APARTMENT_LOCATION', { title })
      .subscribe(text => {
        this.popupText = text;
      });
  }

  // ⛶ Fullscreen
  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;

    setTimeout(() => {
      this.map.invalidateSize();
      this.map.setView([this.lat, this.lng], this.zoom);
    }, 200);
  }

  // 📍 فتح في Google Maps
  openInGoogleMaps(): void {
    const url = `https://www.google.com/maps?q=${this.lat},${this.lng}`;
    window.open(url, '_blank');
  }

  // 🧭 تحديد موقعي الحالي
  locateMe(): void {
    if (!navigator.geolocation) {
      alert('Geolocation not supported');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;

        const userMarker = L.marker([latitude, longitude], {
          icon: L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/64/64113.png',
            iconSize: [28, 28],
            iconAnchor: [14, 28]
          })
        }).addTo(this.map);

        this.translate.get('MAP.YOUR_LOCATION').subscribe(text => {
          userMarker.bindPopup(text).openPopup();
        });

        this.map.setView([latitude, longitude], 14);
      },
      () => alert('Location permission denied')
    );
  }
  onTouchStart(event: TouchEvent, key: string): void {
  this.longPressTriggered = false;

  this.longPressTimer = setTimeout(() => {
    this.activeTooltip = key;
    this.longPressTriggered = true;
  }, 500); // ⏱️ مدة الـ long-press
}

onTouchEnd(): void {
  if (this.longPressTimer) {
    clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
  }

  // إخفاء Tooltip بعد الرفع
  setTimeout(() => {
    this.activeTooltip = null;
  }, 1500);
}

onClick(event: Event, action: 'google' | 'locate' | 'fullscreen'): void {
  // إذا كان هذا click ناتج عن long-press → تجاهله
  if (this.longPressTriggered) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  // تنفيذ الفعل الطبيعي
  switch (action) {
    case 'google':
      this.openInGoogleMaps();
      break;
    case 'locate':
      this.locateMe();
      break;
    case 'fullscreen':
      this.toggleFullscreen();
      break;
  }
}
}
