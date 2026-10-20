import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { EnumService } from './enum.service';

// Shape returned by GET /api/enums/{name} (camelCase, see EnumController).
const FURNISHING = [{ id: 0, key: 'Unfurnished' }, { id: 1, key: 'SemiFurnished' }, { id: 2, key: 'Furnished' }];

describe('EnumService', () => {
  let service: EnumService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EnumService);
    http = TestBed.inject(HttpTestingController);
    spyOn(console, 'warn');
  });

  const furnishingRequests = () => http.match(req => req.url.endsWith('/enums/FurnishingStatus'));

  it('maps backend enum items to Id/Key and caches them', async () => {
    const loading = service.ensureLoaded(['FurnishingStatus']);
    furnishingRequests()[0].flush(FURNISHING);
    await loading;

    expect(service.getList('FurnishingStatus')).toEqual([
      { Id: 0, Key: 'Unfurnished' }, { Id: 1, Key: 'SemiFurnished' }, { Id: 2, Key: 'Furnished' }
    ]);
    expect(service.getKey('FurnishingStatus', 2)).toBe('Furnished');
  });

  it('does not cache a failed load, so the next ensureLoaded retries and recovers', async () => {
    const first = service.ensureLoaded(['FurnishingStatus']);
    furnishingRequests()[0].flush('boom', { status: 503, statusText: 'Unavailable' });
    await first;
    expect(service.getList('FurnishingStatus')).toEqual([]);

    const retry = service.ensureLoaded(['FurnishingStatus']);
    const requests = furnishingRequests();
    expect(requests.length).toBe(1);
    requests[0].flush(FURNISHING);
    await retry;

    expect(service.getList('FurnishingStatus').length).toBe(3);
  });

  it('skips groups that are already loaded and de-duplicates concurrent loads', async () => {
    const a = service.ensureLoaded(['FurnishingStatus']);
    const b = service.ensureLoaded(['FurnishingStatus']);
    const requests = furnishingRequests();
    expect(requests.length).toBe(1);
    requests[0].flush(FURNISHING);
    await Promise.all([a, b]);

    await service.ensureLoaded(['FurnishingStatus']);
    expect(furnishingRequests().length).toBe(0);
  });
});
