// Unit tests of the location catalog client: request shapes (what the backend is asked) and the mapping of
// answers (nulls, missing fields, unknown enum values) into the app's models.
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { LocationsApiService, toGeoLocation, toGeoSuggestion } from './locations-api.service';
import { geoBreadcrumb, geoName, toGeoType } from '../models/geo-location.model';

describe('LocationsApiService', () => {
  let service: LocationsApiService;
  let http: HttpTestingController;
  const base = `${environment.apiBaseUrl}/locations`;
  const admin = `${environment.apiBaseUrl}/admin/locations`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LocationsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const rawPlace = {
    id: 5, type: 'neighborhood', parentId: 4, countryCode: 'SY', officialName: 'فيلات', nameAr: 'فيلات', nameEn: 'Villat', nameDe: '',
    latitude: '33.5', longitude: null,
    path: [{ id: 2, type: 'Governorate', nameAr: 'دمشق', nameEn: 'Damascus', legacyGovernorateId: 3 }],
    legacy: { governorateId: 3, districtId: null, neighborhoodId: 300 }
  };

  describe('public catalog', () => {
    it('search sends the text, scope and levels, and unwraps the items', () => {
      let result: unknown;
      service.search('  مزة ', { parentId: 2, types: ['District', 'Neighborhood'], limit: 5 }).subscribe(r => (result = r));

      const req = http.expectOne(r => r.url === `${base}/search`);
      expect(req.request.params.get('q')).toBe('مزة');
      expect(req.request.params.get('parentId')).toBe('2');
      expect(req.request.params.get('types')).toBe('District,Neighborhood');
      expect(req.request.params.get('limit')).toBe('5');
      req.flush({ items: [rawPlace] });

      expect((result as { id: number }[]).map(r => r.id)).toEqual([5]);
    });

    it('search omits the scope and levels when none are given', () => {
      service.search('مزة').subscribe();
      const req = http.expectOne(r => r.url === `${base}/search`);
      expect(req.request.params.has('parentId')).toBeFalse();
      expect(req.request.params.has('types')).toBeFalse();
      req.flush({ items: [] });
    });

    it('typing-time calls are quiet: a failure must not toast over the form', () => {
      service.search('مزة').subscribe({ error: () => undefined });
      const req = http.expectOne(r => r.url === `${base}/search`);
      // SKIP_ERROR_TOAST is carried by the request context.
      expect([...req.request.context.keys()].length).toBeGreaterThan(0);
      req.flush('x', { status: 500, statusText: 'err' });
    });

    it('getDescendants and getChildren build their queries', () => {
      service.getDescendants(2, 'District', ' ', 500).subscribe();
      const d = http.expectOne(r => r.url === `${base}/descendants`);
      expect(d.request.params.get('ancestorId')).toBe('2');
      expect(d.request.params.get('type')).toBe('District');
      expect(d.request.params.has('q')).toBeFalse();
      expect(d.request.params.get('limit')).toBe('500');
      d.flush([]);

      service.getChildren(2, 'City').subscribe();
      const c = http.expectOne(r => r.url === `${base}/children`);
      expect(c.request.params.get('parentId')).toBe('2');
      expect(c.request.params.get('type')).toBe('City');
      c.flush([]);
    });

    it('getTopLevel asks for the country\'s governorates', () => {
      service.getTopLevel().subscribe();
      const req = http.expectOne(r => r.url === `${base}/children`);
      expect(req.request.params.get('countryCode')).toBe('SY');
      req.flush([]);
    });

    it('a non-array answer maps to an empty list instead of throwing', () => {
      let result: unknown[] | undefined;
      service.getTopLevel().subscribe(r => (result = r));
      http.expectOne(r => r.url === `${base}/children`).flush(null);
      expect(result).toEqual([]);
    });
  });

  describe('map calls', () => {
    it('mapSearch posts the query with the scope and maps suggestions, keeping the signed proof', () => {
      let out: { suggestions: { source: string; proof: string | null; chain: { matchedLocationId: number | null }[] }[]; providerStatus: string } | undefined;
      service.mapSearch(' شارع الأمين ', { parentId: 4, language: 'ar' }).subscribe(r => (out = r as never));

      const req = http.expectOne(`${base}/map/search`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ query: 'شارع الأمين', parentId: 4, countryCode: 'SY', language: 'ar' });
      req.flush({
        providerStatus: 'ok', attribution: '© OpenStreetMap contributors',
        suggestions: [{ source: 'provider', type: 'Street', name: 'شارع الأمين', proof: 'signed', chain: [{ type: 'District', name: 'المزة', matchedLocationId: 4 }] }]
      });

      expect(out?.providerStatus).toBe('ok');
      expect(out?.suggestions[0].source).toBe('provider');
      expect(out?.suggestions[0].proof).toBe('signed');
      expect(out?.suggestions[0].chain[0].matchedLocationId).toBe(4);
    });

    it('an unknown provider status is treated as unavailable', () => {
      let status = '';
      service.mapSearch('x').subscribe(r => (status = r.providerStatus));
      http.expectOne(`${base}/map/search`).flush({ suggestions: [], providerStatus: 'weird' });
      expect(status).toBe('unavailable');
    });

    it('reverse posts the pin and maps a not-found answer', () => {
      let out: { found: boolean; matched: unknown; street: unknown } | undefined;
      service.reverse(33.5, 36.3, 'en').subscribe(r => (out = r));
      const req = http.expectOne(`${base}/map/reverse`);
      expect(req.request.body).toEqual({ latitude: 33.5, longitude: 36.3, language: 'en' });
      req.flush({ found: false, providerStatus: 'disabled' });
      expect(out).toEqual(jasmine.objectContaining({ found: false, matched: null, street: null }));
    });
  });

  describe('proposals and administration', () => {
    it('submitRequest posts the proposal and maps the decision', () => {
      let out: { status: string; autoApproved: boolean } | undefined;
      service.submitRequest({ type: 'Street', parentLocationId: 4, name: 'شارع جديد', proof: 'p' }).subscribe(r => (out = r));
      const req = http.expectOne(`${base}/requests`);
      expect(req.request.body).toEqual({ type: 'Street', parentLocationId: 4, name: 'شارع جديد', proof: 'p' });
      req.flush({ id: 'abc', status: 'Approved', autoApproved: true, locationId: 9 });
      expect(out).toEqual(jasmine.objectContaining({ status: 'Approved', autoApproved: true }));
    });

    it('admin review calls hit the right endpoints with the notes', () => {
      service.rejectRequest('r1', 'مكرر').subscribe();
      const rej = http.expectOne(`${admin}/requests/r1/reject`);
      expect(rej.request.body).toEqual({ notes: 'مكرر' });
      rej.flush({ id: 'r1', status: 'Rejected' });

      service.markDuplicate('r2', 7, 'نفس المكان').subscribe();
      const dup = http.expectOne(`${admin}/requests/r2/duplicate`);
      expect(dup.request.body).toEqual({ notes: 'نفس المكان', duplicateOfLocationId: 7 });
      dup.flush({ id: 'r2', status: 'Duplicate' });

      service.approveRequest('r3', { nameAr: 'اسم' }).subscribe();
      const app = http.expectOne(`${admin}/requests/r3/approve`);
      expect(app.request.body).toEqual({ nameAr: 'اسم' });
      app.flush({ id: 'r3', status: 'Approved' });
    });

    it('adminList forwards the filter, and archive / restore pick the right verb', () => {
      service.adminList({ parentId: 2, type: 'City', q: ' دم ', includeArchived: true }).subscribe();
      const list = http.expectOne(r => r.url === admin);
      expect(list.request.params.get('parentId')).toBe('2');
      expect(list.request.params.get('q')).toBe('دم');
      expect(list.request.params.get('includeArchived')).toBe('true');
      list.flush({ items: [{ id: 1, type: 'City', aliases: ['a'], isActive: true }], total: 1 });

      service.setArchived(1, true, 'r').subscribe();
      http.expectOne(`${admin}/1/archive`).flush({ id: 1 });
      service.setArchived(1, false).subscribe();
      http.expectOne(`${admin}/1/restore`).flush({ id: 1 });
      service.setActive(1, false).subscribe();
      http.expectOne(`${admin}/1/deactivate`).flush({ id: 1 });
    });

    it('removeAlias encodes the name; merge posts both ids', () => {
      service.removeAlias(1, 'اسم قديم&x').subscribe();
      const del = http.expectOne(r => r.method === 'DELETE' && r.url.startsWith(`${admin}/1/aliases`));
      expect(del.request.url).toContain('name=' + encodeURIComponent('اسم قديم&x'));
      del.flush({ id: 1 });

      service.merge(1, 2, 'duplicate').subscribe();
      const merge = http.expectOne(`${admin}/merge`);
      expect(merge.request.body).toEqual({ sourceLocationId: 1, targetLocationId: 2, reason: 'duplicate' });
      merge.flush({ sourceLocationId: 1, targetLocationId: 2, childrenMoved: 0, listingsMoved: 0, aliasesAdded: 1 });
    });

    it('policy is read with defaults for missing fields', () => {
      let pol: { streetAutoApprovalMinScore: number; streetAutoApprovalEnabled: boolean } | undefined;
      service.getPolicy().subscribe(p => (pol = p));
      http.expectOne(`${admin}/policy`).flush({});
      expect(pol?.streetAutoApprovalMinScore).toBe(0.75);
      expect(pol?.streetAutoApprovalEnabled).toBeFalse();
    });

    it('import posts rows and commit / rollback go to the batch', () => {
      service.importRows({ name: 'n', source: 's', license: 'l', dryRun: true, rows: [] }).subscribe();
      http.expectOne(`${admin}/import`).flush({ batchId: null, dryRun: true, rowsTotal: 0, rowsStaged: 0, rowsSkipped: 0, issues: [] });
      service.commitImport('b1').subscribe();
      http.expectOne(`${admin}/import/b1/commit`).flush({ committed: 3 });
      service.rollbackImport('b1').subscribe();
      http.expectOne(`${admin}/import/b1/rollback`).flush({ rolledBack: 3 });
    });
  });

  describe('mapping helpers', () => {
    it('toGeoLocation tolerates missing fields, string numbers and a case-insensitive type', () => {
      const l = toGeoLocation(rawPlace);
      expect(l.type).toBe('Neighborhood');
      expect(l.latitude).toBe(33.5);
      expect(l.longitude).toBeNull();
      expect(l.nameDe).toBeNull();
      expect(l.legacy.neighborhoodId).toBe(300);
      expect(toGeoLocation({}).path).toEqual([]);
    });

    it('toGeoSuggestion defaults to a local suggestion', () => {
      expect(toGeoSuggestion({ type: 'District', name: 'x' }).source).toBe('local');
    });

    it('geoName picks the UI language with fallbacks, and the breadcrumb skips the country', () => {
      const p = toGeoLocation(rawPlace);
      expect(geoName(p, 'ar')).toBe('فيلات');
      expect(geoName(p, 'de')).toBe('Villat'); // no German name: English
      expect(geoName({ nameAr: 'ع', nameEn: '' }, 'en')).toBe('ع');
      expect(geoBreadcrumb([{ ...p.path[0], type: 'Country' }, ...p.path], 'en')).toBe('Damascus');
      expect(toGeoType('nonsense')).toBe('District');
    });
  });
});
