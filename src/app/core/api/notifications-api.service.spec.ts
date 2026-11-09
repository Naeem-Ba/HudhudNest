import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { NotificationsApiService, toMessageReceivedEvent } from './notifications-api.service';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import { LanguageService } from '../services/language.service';

describe('NotificationsApiService (lazy SignalR client)', () => {
  let service: NotificationsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: BackendApiService, useValue: {} },
        { provide: LanguageService, useValue: { getCurrent: () => 'de' } },
        { provide: TokenStorageService, useValue: { getAccessToken: () => null } }
      ]
    });
    service = TestBed.inject(NotificationsApiService);
  });

  it('reports connecting at once, before the client library has loaded', () => {
    service.connect();
    service.connect(); // a second call while loading must not start a second connection

    expect(service.connectionState()).toBe('connecting');
    service.disconnect();
  });

  it('does not open a connection when disconnect() runs while the library is loading', async () => {
    service.connect();
    service.disconnect();

    await import('@microsoft/signalr'); // let the pending dynamic import settle
    await Promise.resolve();

    expect(service.connectionState()).toBe('disconnected');
  });
});

describe('NotificationsApiService.getNotifications (site language)', () => {
  function setup(lang: string) {
    const api = jasmine.createSpyObj<BackendApiService>('BackendApiService', ['get']);
    api.get.and.returnValue(of([] as never));
    TestBed.configureTestingModule({
      providers: [
        { provide: BackendApiService, useValue: api },
        { provide: LanguageService, useValue: { getCurrent: () => lang } },
        { provide: TokenStorageService, useValue: { getAccessToken: () => null } }
      ]
    });
    return { api, service: TestBed.inject(NotificationsApiService) };
  }

  for (const lang of ['ar', 'en', 'de']) {
    it(`sends the current site language (${lang}) with the list request`, () => {
      const { api, service } = setup(lang);

      service.getNotifications(2, 10).subscribe();

      expect(api.get).toHaveBeenCalledWith('/notifications', { page: 2, pageSize: 10, language: lang });
    });
  }
});

describe('toMessageReceivedEvent (live chat refresh, P25-D02)', () => {
  const P = '3f2b8c1e-9d4a-4c55-8f0a-1b2c3d4e5f60';
  const S = '11111111-2222-4333-8444-555555555555';
  const M = '99999999-2222-4333-8444-555555555555';

  it('reads the camelCase payload the hub sends', () => {
    expect(toMessageReceivedEvent({ propertyId: P, senderId: S, messageId: M })).toEqual({ propertyId: P, senderId: S, messageId: M });
  });

  it('also accepts PascalCase', () => {
    expect(toMessageReceivedEvent({ PropertyId: P, SenderId: S, MessageId: M })).toEqual({ propertyId: P, senderId: S, messageId: M });
  });

  it('ignores a malformed payload instead of refreshing on garbage', () => {
    expect(toMessageReceivedEvent(null)).toBeNull();
    expect(toMessageReceivedEvent({ propertyId: P })).toBeNull();
    expect(toMessageReceivedEvent({ propertyId: 1, senderId: S, messageId: M })).toBeNull();
  });
});
