import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { MapResult, PropertyMapApiService, roundBox } from '../../core/api/property-map-api.service';
import { PropertyMapPage } from './property-map.page';

const points: MapResult = {
  mode: 'points', total: 2, clusters: [],
  points: [
    { id: 'p1', title: '<b>x</b>', latitude: 33.51, longitude: 36.29, isLocationApproximate: false, listingType: 'ForRent', purchasePrice: null, rent: 300, currencyCode: 'USD', rooms: 2, area: 80, mainImageUrl: null, isFeatured: false },
    { id: 'p2', title: 'Hidden', latitude: 33.5125, longitude: 36.2925, isLocationApproximate: true, listingType: 'ForSale', purchasePrice: 90000, rent: null, currencyCode: 'USD', rooms: 3, area: 120, mainImageUrl: null, isFeatured: true }
  ]
};

describe('PropertyMapPage', () => {
  let api: jasmine.SpyObj<PropertyMapApiService>;

  function create(result: MapResult = points) {
    api = jasmine.createSpyObj<PropertyMapApiService>('PropertyMapApiService', ['load']);
    api.load.and.returnValue(of(result));
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [provideRouter([]), { provide: PropertyMapApiService, useValue: api }]
    });
    const fixture = TestBed.createComponent(PropertyMapPage);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the visible box once after the map settles and draws the points', fakeAsync(() => {
    const fixture = create();
    tick(400);
    expect(api.load).toHaveBeenCalledTimes(1);
    const [box, filters] = api.load.calls.mostRecent().args;
    expect(box.zoom).toBe(7);
    expect(filters).toEqual({ listingType: null, minRooms: null });
    expect(fixture.componentInstance.result()?.total).toBe(2);
    expect((fixture.nativeElement as HTMLElement).querySelector('.pm-price span')?.innerHTML).not.toContain('<b>');
    fixture.destroy();
  }));

  it('draws clusters instead of points when the server clustered', fakeAsync(() => {
    const fixture = create({ mode: 'clusters', total: 900, points: [], clusters: [{ latitude: 33.5, longitude: 36.3, count: 600 }, { latitude: 36.2, longitude: 37.1, count: 300 }] });
    tick(400);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.pm-cluster').length).toBe(2);
    fixture.destroy();
  }));

  it('rounds the box outward so small pans share a cached answer', () => {
    expect(roundBox({ minLat: 33.51234, minLng: 36.29876, maxLat: 33.60001, maxLng: 36.4, zoom: 11.6 }))
      .toEqual({ minLat: 33.512, minLng: 36.298, maxLat: 33.601, maxLng: 36.4, zoom: 12 });
  });
});
