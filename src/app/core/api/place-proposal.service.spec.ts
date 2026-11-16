import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { GeoLocation } from '../models/geo-location.model';
import { locationsApiStub } from '../../shared/ui/geo/locations-api.stub.spec';
import { LocationsApiService } from './locations-api.service';
import { PlaceProposalService } from './place-proposal.service';

function place(id: number, type: GeoLocation['type'], legacy: Partial<GeoLocation['legacy']>): GeoLocation {
  return {
    id, type, parentId: null, countryCode: 'SY', officialName: 'x', nameAr: 'x', nameEn: 'x', nameDe: null,
    latitude: null, longitude: null, path: [], legacy: { governorateId: null, districtId: null, neighborhoodId: null, ...legacy },
    matchedAlias: null
  };
}

describe('PlaceProposalService', () => {
  let locations: jasmine.SpyObj<LocationsApiService>;
  let token: string | null;
  let service: PlaceProposalService;

  beforeEach(() => {
    token = 'jwt';
    locations = locationsApiStub();
    locations.getTopLevel.and.returnValue(of([place(10, 'Governorate', { governorateId: 1 }), place(20, 'Governorate', { governorateId: 2 })]));
    locations.getDescendants.and.returnValue(of([place(110, 'District', { districtId: 5 })]));
    locations.submitRequest.and.returnValue(of({ id: 'r1' } as never));

    TestBed.configureTestingModule({
      providers: [
        { provide: LocationsApiService, useValue: locations },
        { provide: AuthService, useValue: { getAccessToken: () => token } }
      ]
    });
    service = TestBed.inject(PlaceProposalService);
  });

  it('proposes a district inside its governorate (found through the older id)', done => {
    service.propose({ governorateId: 2, type: 'District', name: ' الشعلان ' }).subscribe(ok => {
      expect(ok).toBeTrue();
      expect(locations.submitRequest).toHaveBeenCalledOnceWith({ type: 'District', parentLocationId: 20, name: 'الشعلان' });
      done();
    });
  });

  it('proposes a neighborhood inside the chosen district when there is one', done => {
    service.propose({ governorateId: 1, districtId: 5, type: 'Neighborhood', name: 'الحارة' }).subscribe(ok => {
      expect(ok).toBeTrue();
      expect(locations.submitRequest).toHaveBeenCalledOnceWith({ type: 'Neighborhood', parentLocationId: 110, name: 'الحارة' });
      done();
    });
  });

  it('falls back to the governorate when the district is not in the catalog yet', done => {
    locations.getDescendants.and.returnValue(of([]));
    service.propose({ governorateId: 1, districtId: 99, type: 'Neighborhood', name: 'الحارة' }).subscribe(ok => {
      expect(ok).toBeTrue();
      expect(locations.submitRequest.calls.mostRecent().args[0].parentLocationId).toBe(10);
      done();
    });
  });

  it('sends nothing for an empty name, for a person who is not signed in, or for an unknown governorate', done => {
    service.propose({ governorateId: 1, type: 'District', name: '   ' }).subscribe(a => {
      token = null;
      service.propose({ governorateId: 1, type: 'District', name: 'x' }).subscribe(b => {
        token = 'jwt';
        service.propose({ governorateId: 99, type: 'District', name: 'x' }).subscribe(c => {
          expect([a, b, c]).toEqual([false, false, false]);
          expect(locations.submitRequest).not.toHaveBeenCalled();
          done();
        });
      });
    });
  });

  it('never fails the caller: an error answers false', done => {
    locations.submitRequest.and.returnValue(throwError(() => new Error('403')));
    service.propose({ governorateId: 1, type: 'District', name: 'x' }).subscribe(ok => {
      expect(ok).toBeFalse();
      done();
    });
  });
});
