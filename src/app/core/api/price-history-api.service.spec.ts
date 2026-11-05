import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { PriceHistoryApiService } from './price-history-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';

describe('PriceHistoryApiService', () => {
  let backend: jasmine.SpyObj<BackendApiService>;
  let service: PriceHistoryApiService;

  beforeEach(() => {
    backend = jasmine.createSpyObj<BackendApiService>('BackendApiService', ['get']);
    TestBed.configureTestingModule({ providers: [{ provide: BackendApiService, useValue: backend }] });
    service = TestBed.inject(PriceHistoryApiService);
  });

  it('reads the changes without an error toast', done => {
    backend.get.and.returnValue(of({ propertyId: 'p1', changes: [{ priceField: 'ColdRent' }] }) as never);
    service.getChanges('p1').subscribe(changes => {
      expect(changes.length).toBe(1);
      const [path, , options] = backend.get.calls.mostRecent().args;
      expect(path).toBe('/properties/p1/price-history');
      expect(options?.context?.get(SKIP_ERROR_TOAST)).toBeTrue();
      done();
    });
  });

  it('turns a 404 or a network error into an empty list', done => {
    backend.get.and.returnValue(throwError(() => ({ status: 404 })));
    service.getChanges('p1').subscribe(changes => {
      expect(changes).toEqual([]);
      done();
    });
  });
});
