import { TestBed } from '@angular/core/testing';
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
});
