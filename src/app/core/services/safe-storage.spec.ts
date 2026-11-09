import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';

import { LanguageService } from './language.service';
import { resetSafeStorageMemory, safeGetItem, safeRemoveItem, safeSetItem } from './safe-storage';
import { TokenStorageService } from './token-storage.service';

/**
 * QA Phase 26, P26-D01: with `localStorage` throwing (blocked site data, some WebViews) or full, the
 * language service threw while the app was starting and the user saw a blank page.
 */
describe('safe storage (blocked or full browser storage)', () => {
  const realLocal = window.localStorage;
  const realSession = window.sessionStorage;
  let blocked = false;
  let mode: 'accessor' | 'methods' = 'accessor';

  /** A storage whose every method throws (full quota / blocked writes). */
  const throwingStorage = {
    getItem: () => { throw new DOMException('blocked', 'SecurityError'); },
    setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
    removeItem: () => { throw new DOMException('blocked', 'SecurityError'); }
  } as unknown as Storage;

  /** Runs `fn` while the browser storage misbehaves; everything else (Jasmine, Zone) sees the real storage. */
  function whileBlocked<T>(fn: () => T, how: 'accessor' | 'methods' = 'accessor'): T {
    mode = how;
    blocked = true;
    try {
      return fn();
    } finally {
      blocked = false;
    }
  }

  function storageGetter(real: Storage): () => Storage {
    return () => {
      if (!blocked) {
        return real;
      }
      if (mode === 'accessor') {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      }
      return throwingStorage;
    };
  }

  beforeEach(() => {
    spyOnProperty(window, 'localStorage', 'get').and.callFake(storageGetter(realLocal));
    spyOnProperty(window, 'sessionStorage', 'get').and.callFake(storageGetter(realSession));
  });

  afterEach(() => {
    resetSafeStorageMemory();
    realLocal.removeItem('probe');
  });

  it('works like normal storage when it is available', () => {
    safeSetItem('probe', 'a');
    expect(realLocal.getItem('probe')).toBe('a');
    expect(safeGetItem('probe')).toBe('a');
    safeRemoveItem('probe');
    expect(safeGetItem('probe')).toBeNull();
  });

  it('never throws when every storage call throws, and remembers the value for this page load', () => {
    whileBlocked(() => {
      expect(() => safeSetItem('probe', 'x')).not.toThrow();
      expect(safeGetItem('probe')).toBe('x');
      expect(() => safeRemoveItem('probe')).not.toThrow();
      expect(safeGetItem('probe')).toBeNull();
    }, 'methods');
  });

  it('survives the storage accessor itself throwing (Chrome "block all site data")', () => {
    whileBlocked(() => {
      expect(() => safeSetItem('probe', 'y')).not.toThrow();
      expect(safeGetItem('probe')).toBe('y');
    });
  });

  describe('start-up services', () => {
    it('LanguageService starts, switches language and keeps it for the visit', () => {
      const translate = jasmine.createSpyObj<TranslateService>('TranslateService', ['addLangs', 'use', 'setFallbackLang', 'setDefaultLang']);
      TestBed.configureTestingModule({ providers: [{ provide: TranslateService, useValue: translate }] });

      whileBlocked(() => {
        const service = TestBed.inject(LanguageService);
        expect(['ar', 'en', 'de']).toContain(service.getCurrent());

        service.use('de');
        expect(service.getCurrent()).toBe('de');
        expect(service.hasUserChoice()).toBeTrue();

        service.restoreGuestLanguage();
        expect(service.getCurrent()).toBe('de');
      });
    });

    it('TokenStorageService.clear() does not throw', () => {
      TestBed.configureTestingModule({});
      const tokens = TestBed.inject(TokenStorageService);

      whileBlocked(() => expect(() => tokens.clear()).not.toThrow());
    });
  });
});
