// Test helper (a .spec.ts file so it stays out of the app build): a LocationsApiService double whose calls
// answer with empty results instead of undefined, which is what every form hosting <app-geo-picker> needs.
import { of } from 'rxjs';

import { LocationsApiService } from '../../../core/api/locations-api.service';

export function locationsApiStub(): jasmine.SpyObj<LocationsApiService> {
  const spy = jasmine.createSpyObj<LocationsApiService>('LocationsApiService', [
    'getTopLevel', 'getChildren', 'getDescendants', 'search', 'get', 'getHierarchy', 'getCountries',
    'mapSearch', 'reverse', 'submitRequest', 'myRequests'
  ]);
  spy.getTopLevel.and.returnValue(of([]));
  spy.getChildren.and.returnValue(of([]));
  spy.getDescendants.and.returnValue(of([]));
  spy.search.and.returnValue(of([]));
  spy.getCountries.and.returnValue(of([]));
  spy.myRequests.and.returnValue(of([]));
  spy.getHierarchy.and.returnValue(of([]));
  spy.mapSearch.and.returnValue(of({ suggestions: [], providerStatus: 'skipped', attribution: null }));
  spy.reverse.and.returnValue(of({
    found: false, displayName: null, matched: null, chain: [], street: null, providerStatus: 'disabled', attribution: null
  }));
  return spy;
}
