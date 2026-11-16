// src/app/shared/ui/offices-map.component.ts
//
// خريطة مكاتب/فروع للقراءة فقط (Leaflet): علامة لكل فرع له إحداثيات. تُستعمل في صفحة المكتب (فروعه فقط،
// تتسع الخريطة لتشملها) وفي عرض الخريطة بالدليل (تعيد حدود الخريطة بعد كل تحريك ليجلب الأب علامات المنطقة).
// لا موقع افتراضي لمكتب بلا فرع على الخريطة: من لا إحداثيات له لا يظهر هنا أصلًا.
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject
} from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';

import { MAP_TILE_LAYER } from '../../map-picker/map-picker.component';

export interface OfficeMapPoint {
  id: string;
  latitude: number;
  longitude: number;
  /** النص على العلامة: اسم المكتب في الدليل، اسم الفرع في صفحة المكتب. */
  label: string;
  /** سطر إضافي في التلميح (اسم الفرع في الدليل). */
  detail?: string | null;
  verified?: boolean;
  main?: boolean;
  /** مسار تفتحه العلامة عند النقر (مثل ['/offices', slug])؛ بلاه العلامة للعرض فقط. */
  link?: unknown[] | null;
  /** حالة التنقل مع الرابط (مثل مصدر الزيارة لإحصاءات المكتب). */
  linkState?: Record<string, unknown> | null;
}

export interface OfficeMapBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** دون هذا التكبير تُرسم العلامات نقاطًا صغيرة (الاسم في التلميح) كي لا تتراكب أسماء الفروع المتجاورة. */
export const OFFICES_MAP_LABEL_ZOOM = 11;

/** سوريا افتراضيًا، كما في خريطة الإعلانات. */
const DEFAULT_CENTER: L.LatLngTuple = [34.8, 38.5];
const DEFAULT_ZOOM = 7;

@Component({
  selector: 'app-offices-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #mapEl class="offices-map" [style.height]="height" [attr.aria-label]="ariaLabel" role="region"></div>`,
  styles: [`
    :host { display: block; }
    .offices-map { width: 100%; border-radius: var(--r-lg, 14px); border: 1px solid var(--border); overflow: hidden; z-index: 0; }
    :host ::ng-deep .om-pin { display: grid; place-items: center; }
    :host ::ng-deep .om-pin span {
      display: inline-block; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      background: var(--surface); color: var(--text-strong); border: 2px solid var(--primary); border-radius: 999px;
      padding: .1rem .55rem; font-size: .78rem; font-weight: 700; box-shadow: var(--shadow-xs); cursor: pointer;
    }
    :host ::ng-deep .om-pin--verified span { border-color: var(--success-text); }
    :host ::ng-deep .om-pin--dot span {
      width: 14px; height: 14px; padding: 0; border-radius: 50%; background: var(--primary); border: 2px solid var(--surface);
    }
    :host ::ng-deep .om-pin--dot.om-pin--verified span { background: var(--success-text); }
    :host ::ng-deep .om-pin--main span { background: var(--primary); color: var(--on-primary); }
  `]
})
export class OfficesMapComponent implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);

  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  @Input() height = '360px';
  @Input() ariaLabel = '';
  /** true: تتسع الخريطة لتشمل كل العلامات عند تغيّرها (صفحة المكتب). false: يقرر المستخدم المنطقة (الدليل). */
  @Input() fitToPoints = false;
  /** نقطة البداية إن عُرفت (موقع الزائر بعد «القريبة مني»)؛ بلاها تبدأ الخريطة بسوريا كاملة. */
  @Input() initialCenter: { latitude: number; longitude: number } | null = null;

  @Input() set points(value: OfficeMapPoint[] | null | undefined) {
    this.current = value ?? [];
    this.draw();
  }

  /** حدود الخريطة بعد كل تحريك أو تكبير (وبعد الرسم الأول). */
  @Output() readonly boundsChange = new EventEmitter<OfficeMapBounds>();

  private current: OfficeMapPoint[] = [];
  private labelled = false;
  private map?: L.Map;
  private layer?: L.LayerGroup;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const start = this.initialCenter;
      this.map = L.map(this.mapEl.nativeElement, start
        ? { center: [start.latitude, start.longitude], zoom: 12 }
        : { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
      L.tileLayer(MAP_TILE_LAYER.url, MAP_TILE_LAYER.options).addTo(this.map);
      this.layer = L.layerGroup().addTo(this.map);
      this.map.on('moveend', () => this.zone.run(() => this.emitBounds()));
      this.map.on('zoomend', () => {
        const labelled = (this.map?.getZoom() ?? 0) >= OFFICES_MAP_LABEL_ZOOM;
        if (labelled !== this.labelled) this.draw(false);
      });
    });
    this.draw();
    this.emitBounds();
  }

  ngOnDestroy(): void {
    this.map?.remove();
    this.map = undefined;
  }

  /** للأب: يحرّك الخريطة إلى نقطة (مثل موقع الزائر بعد «القريبة مني»). */
  centerOn(latitude: number, longitude: number, zoom = 12): void {
    this.map?.setView([latitude, longitude], zoom);
  }

  /** عام للاختبارات: يرسم العلامات ويعيد عددها. fit=false عند إعادة الرسم بعد تكبير المستخدم نفسه. */
  draw(fit = true): number {
    if (!this.layer || !this.map) return 0;
    // Fitting can zoom synchronously and redraw from the zoomend handler, so clear only after it.
    if (fit) this.fit();
    this.layer.clearLayers();
    this.labelled = this.map.getZoom() >= OFFICES_MAP_LABEL_ZOOM;
    for (const p of this.current) {
      const classes = ['om-pin'];
      if (!this.labelled) classes.push('om-pin--dot');
      if (p.verified) classes.push('om-pin--verified');
      if (p.main) classes.push('om-pin--main');
      const title = p.detail ? `${p.label} · ${p.detail}` : p.label;
      const marker = L.marker([p.latitude, p.longitude], {
        icon: this.labelled
          ? L.divIcon({ className: classes.join(' '), html: `<span>${escapeHtml(p.label)}</span>`, iconSize: [160, 28] })
          : L.divIcon({ className: classes.join(' '), html: '<span></span>', iconSize: [18, 18] }),
        keyboard: true,
        title
      });
      if (p.detail || !this.labelled) marker.bindTooltip(escapeHtml(title));
      const link = p.link;
      const state = p.linkState ?? undefined;
      if (link) marker.on('click', () => this.zone.run(() => state ? this.router.navigate(link, { state }) : this.router.navigate(link)));
      this.layer.addLayer(marker);
    }
    return this.current.length;
  }

  private fit(): void {
    if (!this.map) return;
    const [first] = this.current;
    if (this.fitToPoints && first) {
      if (this.current.length === 1) {
        this.map.setView([first.latitude, first.longitude], 15);
      } else {
        this.map.fitBounds(L.latLngBounds(this.current.map(p => [p.latitude, p.longitude] as L.LatLngTuple)), { padding: [32, 32], maxZoom: 15 });
      }
    }
  }

  private emitBounds(): void {
    if (!this.map) return;
    const b = this.map.getBounds();
    this.boundsChange.emit({
      minLat: clamp(b.getSouth(), -90, 90),
      minLng: clamp(b.getWest(), -180, 180),
      maxLat: clamp(b.getNorth(), -90, 90),
      maxLng: clamp(b.getEast(), -180, 180)
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
