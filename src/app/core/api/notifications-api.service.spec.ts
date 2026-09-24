import { TestBed } from '@angular/core/testing';

import { NotificationsApiService } from './notifications-api.service';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';

describe('NotificationsApiService (lazy SignalR client)', () => {
  let service: NotificationsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: BackendApiService, useValue: {} },
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
