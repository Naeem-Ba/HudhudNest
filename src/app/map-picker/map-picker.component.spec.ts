import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { LocationsApiService } from '../core/api/locations-api.service';
import { GeoMapSuggestion } from '../core/models/geo-location.model';
import * as L from 'leaflet';

import { MAP_TILE_LAYER, MapPickerComponent } from './map-picker.component';

describe('MapPickerComponent', () => {
  it('uses a basemap that needs no API key (CARTO tiles render "API KEY REQUIRED")', () => {
    expect(MAP_TILE_LAYER.url).not.toContain('cartocdn');
    expect(MAP_TILE_LAYER.url).toContain('{z}');
    expect(MAP_TILE_LAYER.url).toContain('{x}');
    expect(MAP_TILE_LAYER.url).toContain('{y}');
    expect(MAP_TILE_LAYER.options.attribution).toContain('OpenStreetMap');
  });

  it('requests tiles from that layer once the map is created', () => {
    const fixture = TestBed.createComponent(MapPickerComponent);
    fixture.detectChanges();

    const layers: L.TileLayer[] = [];
    const map = (fixture.componentInstance as unknown as { map: L.Map }).map;
    map.eachLayer(layer => { if (layer instanceof L.TileLayer) layers.push(layer); });

    expect(layers.length).toBe(1);
    expect(layers[0].getTileUrl({ x: 1, y: 2, z: 3 } as L.Coords)).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/1\/2\.png$/);
    fixture.destroy();
  });

  it('places and clears a parent-controlled pin without emitting', () => {
    const fixture = TestBed.createComponent(MapPickerComponent);
    const emitted: unknown[] = [];
    fixture.componentInstance.locationChange.subscribe(v => emitted.push(v));
    fixture.detectChanges();

    fixture.componentInstance.marker = { lat: 33.5, lng: 36.3 };
    fixture.componentInstance.ngOnChanges({ marker: {} as never });
    const map = (fixture.componentInstance as unknown as { map: L.Map }).map;
    const markers = (): L.Marker[] => {
      const found: L.Marker[] = [];
      map.eachLayer(layer => { if (layer instanceof L.Marker) found.push(layer); });
      return found;
    };
    expect(markers().length).toBe(1);

    fixture.componentInstance.marker = null;
    fixture.componentInstance.ngOnChanges({ marker: {} as never });
    expect(markers().length).toBe(0);
    expect(emitted).toEqual([]);
    fixture.destroy();
  });

  it('has Turkish texts for the search, the zoom controls and the location messages (never Arabic or a thrown error under tr)', () => {
    const fixture = TestBed.createComponent(MapPickerComponent);
    fixture.componentInstance.lang = 'tr';
    fixture.detectChanges();
    const picker = fixture.componentInstance;

    for (const key of ['placeholder', 'button', 'none', 'unavailable', 'searching'] as const) {
      const text = picker.searchText_(key);
      expect(text).withContext(key).not.toMatch(/[\u0600-\u06FF]/);
      expect(text).withContext(key).not.toBe(picker.searchText_.call({ ...picker, lang: 'en' }, key));
    }
    const message = (picker as unknown as { message(k: string): string }).message('locationDenied');
    expect(message).toContain('Konum erişimi');
    const titles = (picker as unknown as { controlTitles(): { zoomIn: string } }).controlTitles();
    expect(titles.zoomIn).toBe('Yakınlaştır');
    expect(fixture.nativeElement.textContent).not.toMatch(/[\u0600-\u06FF]/);
    fixture.destroy();
  });

  describe('map search (explicit only)', () => {
    const suggestion = (over: Partial<GeoMapSuggestion> = {}): GeoMapSuggestion => ({
      source: 'provider', type: 'Street', name: 'شارع الأمين', displayName: 'شارع الأمين، المزة', latitude: 33.51, longitude: 36.27,
      locationId: null, externalProvider: 'nominatim', externalPlaceId: '1', chain: [], proof: 'signed', ...over
    });
    let api: jasmine.SpyObj<LocationsApiService>;

    function create(searchable = true) {
      api = jasmine.createSpyObj<LocationsApiService>('LocationsApiService', ['mapSearch']);
      TestBed.configureTestingModule({ providers: [{ provide: LocationsApiService, useValue: api }] });
      const fixture = TestBed.createComponent(MapPickerComponent);
      fixture.componentInstance.searchable = searchable;
      fixture.detectChanges();
      return fixture;
    }

    it('does not call the backend for a query shorter than 3 characters', () => {
      const fixture = create();
      fixture.componentInstance.searchText.set('ab');
      fixture.componentInstance.runSearch();
      expect(api.mapSearch).not.toHaveBeenCalled();
      fixture.destroy();
    });

    it('searches inside the scope and keeps only results that can be placed on the map', () => {
      const fixture = create();
      const picker = fixture.componentInstance;
      api.mapSearch.and.returnValue(of({
        suggestions: [suggestion(), suggestion({ name: 'بلا إحداثيات', latitude: null, longitude: null })],
        providerStatus: 'ok', attribution: '© OpenStreetMap contributors'
      }));
      picker.searchParentId = 4;
      picker.searchText.set('الأمين');
      picker.runSearch();

      expect(api.mapSearch).toHaveBeenCalledWith('الأمين', jasmine.objectContaining({ parentId: 4 }));
      expect(picker.searchResults().map(r => r.name)).toEqual(['شارع الأمين']);
      expect(picker.searchAttribution()).toContain('OpenStreetMap');
      fixture.destroy();
    });

    it('choosing a result moves the pin, reports the place and clears the list', () => {
      const fixture = create();
      const picker = fixture.componentInstance;
      const chosen: GeoMapSuggestion[] = [];
      const pins: unknown[] = [];
      picker.placeSelected.subscribe(p => chosen.push(p));
      picker.locationChange.subscribe(v => pins.push(v));
      picker.searchResults.set([suggestion()]);

      picker.chooseSearchResult(suggestion());

      expect(chosen.length).toBe(1);
      expect(chosen[0].proof).toBe('signed');
      expect(pins.length).toBe(1);
      expect(picker.searchResults()).toEqual([]);
      fixture.destroy();
    });

    it('a result outside the valid coordinate range is ignored', () => {
      const fixture = create();
      const chosen: unknown[] = [];
      fixture.componentInstance.placeSelected.subscribe(p => chosen.push(p));
      fixture.componentInstance.chooseSearchResult(suggestion({ latitude: 123, longitude: 400 }));
      expect(chosen).toEqual([]);
      fixture.destroy();
    });

    it('a backend failure shows the unavailable notice and never throws', () => {
      const fixture = create();
      const picker = fixture.componentInstance;
      api.mapSearch.and.returnValue(throwError(() => new Error('down')));
      picker.searchText.set('الأمين');
      picker.runSearch();

      expect(picker.searchResults()).toEqual([]);
      expect(picker.searchNotice()).toBe(picker.searchText_('unavailable'));
      fixture.destroy();
    });

    it('a provider that is disabled still shows the catalog results with no error', () => {
      const fixture = create();
      const picker = fixture.componentInstance;
      api.mapSearch.and.returnValue(of({ suggestions: [suggestion({ source: 'local' })], providerStatus: 'disabled', attribution: null }));
      picker.searchText.set('الأمين');
      picker.runSearch();
      expect(picker.searchResults().length).toBe(1);
      expect(picker.searchNotice()).toBe('');
      fixture.destroy();
    });
  });
});

describe('MapPickerComponent controls layout', () => {
  const rect = (el: Element): DOMRect => el.getBoundingClientRect();
  const overlap = (a: DOMRect, b: DOMRect): boolean =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  async function layout(lang: 'ar' | 'en' | 'de' | 'tr', dir: 'rtl' | 'ltr', width: number): Promise<void> {
    const previousDir = document.documentElement.dir;
    document.documentElement.dir = dir;
    const fixture = TestBed.createComponent(MapPickerComponent);
    fixture.componentInstance.lang = lang;
    fixture.nativeElement.style.cssText = `display:block;width:${width}px;position:absolute;top:0;left:0`;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { map: L.Map }).map.invalidateSize();

    const wrapper = fixture.nativeElement.querySelector('.map-wrapper') as HTMLElement;
    const zoomIn = fixture.nativeElement.querySelector('.leaflet-control-zoom-in') as HTMLElement;
    const zoomOut = fixture.nativeElement.querySelector('.leaflet-control-zoom-out') as HTMLElement;
    const locate = fixture.nativeElement.querySelector('.map-action') as HTMLElement;

    for (const zoom of [zoomIn, zoomOut]) {
      expect(overlap(rect(zoom), rect(locate)))
        .withContext(`${lang}/${dir}/${width}px: the location button must not cover a zoom button`).toBeFalse();
      // Whichever element is on top at the centre of a zoom button must be the zoom button itself (it can be clicked).
      const c = rect(zoom);
      const hit = document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2);
      expect(zoom.contains(hit)).withContext(`${lang}/${dir}/${width}px: zoom button reachable`).toBeTrue();
    }
    const w = rect(wrapper);
    const l = rect(locate);
    expect(l.left).withContext('location button inside the map (left)').toBeGreaterThanOrEqual(w.left);
    expect(l.right).withContext('location button inside the map (right)').toBeLessThanOrEqual(w.right + 0.5);

    fixture.destroy();
    document.documentElement.dir = previousDir;
  }

  for (const width of [320, 390, 768, 1280]) {
    it(`does not overlap the zoom buttons in Arabic (RTL) at ${width}px`, async () => layout('ar', 'rtl', width));
    it(`does not overlap the zoom buttons in German (LTR) at ${width}px`, async () => layout('de', 'ltr', width));
    it(`does not overlap the zoom buttons in English (LTR) at ${width}px`, async () => layout('en', 'ltr', width));
  }
});
