import { TestBed } from '@angular/core/testing';

import { ScrollLockService } from './scroll-lock.service';

describe('ScrollLockService', () => {
  let service: ScrollLockService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ScrollLockService);
    document.body.style.top = '';
    document.documentElement.classList.remove('scroll-locked');
  });

  afterEach(() => {
    document.body.style.top = '';
    document.documentElement.classList.remove('scroll-locked');
  });

  it('locks scroll on the first lock() call', () => {
    service.lock();

    expect(document.documentElement.classList.contains('scroll-locked')).toBeTrue();
  });

  it('does not unlock while another caller still holds the lock (ref-count)', () => {
    service.lock();
    service.lock();
    service.unlock();

    expect(document.documentElement.classList.contains('scroll-locked')).toBeTrue();

    service.unlock();

    expect(document.documentElement.classList.contains('scroll-locked')).toBeFalse();
  });

  it('unlock() is a no-op when nothing is locked (never goes negative)', () => {
    service.unlock();
    service.unlock();
    service.lock();

    expect(document.documentElement.classList.contains('scroll-locked')).toBeTrue();

    service.unlock();

    expect(document.documentElement.classList.contains('scroll-locked')).toBeFalse();
  });

  it('forceUnlockIfHeldBy only unlocks when told the caller was actually holding a lock', () => {
    service.lock();

    service.forceUnlockIfHeldBy(false);
    expect(document.documentElement.classList.contains('scroll-locked')).toBeTrue();

    service.forceUnlockIfHeldBy(true);
    expect(document.documentElement.classList.contains('scroll-locked')).toBeFalse();
  });

  it('restores body.style.top to empty once fully unlocked', () => {
    service.lock();
    expect(document.body.style.top).not.toBe('');

    service.unlock();
    expect(document.body.style.top).toBe('');
  });
});
