import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { LookupsApiService } from './lookups-api.service';

describe('LookupsApiService.getGovernorates', () => {
  let api: jasmine.SpyObj<BackendApiService>;
  let service: LookupsApiService;

  beforeEach(() => {
    api = jasmine.createSpyObj('BackendApiService', ['get']);
    TestBed.configureTestingModule({ providers: [LookupsApiService, { provide: BackendApiService, useValue: api }] });
    service = TestBed.inject(LookupsApiService);
  });

  // UI performance audit 2026-11-17: two components of one page sent the same request at the same time.
  it('sends one request per country for every caller, before and after it answers', () => {
    const response = new Subject<unknown[]>();
    api.get.and.returnValue(response);
    const first: unknown[] = [];
    const second: unknown[] = [];
    service.getGovernorates().subscribe(v => first.push(v));
    service.getGovernorates('SY').subscribe(v => second.push(v));
    response.next([{ id: 1, nameAr: 'دمشق', nameEn: 'Damascus' }]);
    response.complete();

    let late: unknown;
    service.getGovernorates().subscribe(v => (late = v));
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(first.length).toBe(1);
    expect(second).toEqual(first);
    expect(late).toEqual(first[0]);
  });

  it('asks again for another country, and after a failure', () => {
    api.get.and.returnValue(throwError(() => new Error('down')));
    service.getGovernorates('SY').subscribe({ error: () => undefined });
    service.getGovernorates('SY').subscribe({ error: () => undefined });
    service.getGovernorates('DE').subscribe({ error: () => undefined });
    expect(api.get).toHaveBeenCalledTimes(3);
  });
});
