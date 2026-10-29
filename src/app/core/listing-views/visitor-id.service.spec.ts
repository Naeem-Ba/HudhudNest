import { TestBed } from '@angular/core/testing';
import { VisitorIdService } from './visitor-id.service';

describe('VisitorIdService', () => {
  const KEY = 'hn.visitorId';

  beforeEach(() => {
    localStorage.removeItem(KEY);
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.removeItem(KEY));

  it('creates a server-acceptable random id once and keeps it', () => {
    const service = TestBed.inject(VisitorIdService);
    const first = service.get();

    expect(VisitorIdService.isValid(first)).toBeTrue();
    expect(service.get()).toBe(first);
    expect(localStorage.getItem(KEY)).toBe(first);
  });

  it('reuses the id of an earlier session', () => {
    localStorage.setItem(KEY, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(TestBed.inject(VisitorIdService).get()).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('replaces a stored value the server would reject', () => {
    localStorage.setItem(KEY, 'not valid!');
    const id = TestBed.inject(VisitorIdService).get();
    expect(id).not.toBe('not valid!');
    expect(VisitorIdService.isValid(id)).toBeTrue();
  });

  it('still returns a stable id when storage is unavailable', () => {
    spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
    spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
    const service = TestBed.inject(VisitorIdService);
    const id = service.get();

    expect(VisitorIdService.isValid(id)).toBeTrue();
    expect(service.get()).toBe(id);
  });

  it('gives different installs different ids', () => {
    const a = TestBed.inject(VisitorIdService).get();
    localStorage.removeItem(KEY);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    expect(TestBed.inject(VisitorIdService).get()).not.toBe(a);
  });
});
