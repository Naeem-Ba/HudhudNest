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
