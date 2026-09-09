import { TestBed } from '@angular/core/testing';
import { ShareSheetCoordinatorService } from './share-sheet-coordinator.service';

describe('ShareSheetCoordinatorService', () => {
  let service: ShareSheetCoordinatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ShareSheetCoordinatorService);
  });

  it('allows the first owner to open', () => {
    expect(service.tryOpen(Symbol('a'))).toBeTrue();
  });

  it('refuses a second, different owner while the first still holds it', () => {
    const a = Symbol('a');
    const b = Symbol('b');

    service.tryOpen(a);

    expect(service.tryOpen(b)).toBeFalse();
    expect(service.isOpenElsewhere(b)).toBeTrue();
  });

  it('allows the same owner to re-open (idempotent)', () => {
    const a = Symbol('a');
    service.tryOpen(a);

    expect(service.tryOpen(a)).toBeTrue();
  });

  it('frees the slot on release, letting a different owner open next', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    service.tryOpen(a);

    service.release(a);

    expect(service.tryOpen(b)).toBeTrue();
  });

  it('release is a no-op for an owner that does not currently hold it', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    service.tryOpen(a);

    service.release(b);

    expect(service.isOpenElsewhere(b)).toBeTrue();
  });
});
