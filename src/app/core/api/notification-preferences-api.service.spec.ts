import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  NotificationPreferencesApiService,
  minuteToTime,
  timeToMinute
} from './notification-preferences-api.service';

describe('NotificationPreferencesApiService', () => {
  let httpMock: HttpTestingController;
  let service: NotificationPreferencesApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(NotificationPreferencesApiService);
  });

  afterEach(() => httpMock.verify());

  it('reads the saved preferences', () => {
    service.get().subscribe(p => expect(p.pushPreview).toBe('Generic'));
    const req = httpMock.expectOne(`${environment.apiUrl}/notifications/preferences`);
    expect(req.request.method).toBe('GET');
    req.flush({ mutedCategories: [], pushMutedCategories: [], pushPreview: 'Generic', quietStartMinute: null, quietEndMinute: null, timeZoneId: null, categories: [] });
  });

  it('sends only the changed fields on update', () => {
    service.update({ pushMutedCategories: ['listings'] }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/notifications/preferences`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ pushMutedCategories: ['listings'] });
    req.flush({});
  });

  it('converts between HH:MM and minutes of the day', () => {
    expect(timeToMinute('07:30')).toBe(450);
    expect(timeToMinute('23:59')).toBe(1439);
    expect(timeToMinute('24:00')).toBeNull();
    expect(timeToMinute('')).toBeNull();
    expect(minuteToTime(450)).toBe('07:30');
    expect(minuteToTime(null)).toBe('');
    expect(minuteToTime(1440)).toBe('');
  });
});
