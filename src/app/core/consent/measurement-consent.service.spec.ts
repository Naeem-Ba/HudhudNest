import { TestBed } from '@angular/core/testing';

import { ReferralCodeService } from '../sharing/referral-code.service';
import { VisitorIdService } from '../listing-views/visitor-id.service';
import { MEASUREMENT_CONSENT_STORAGE_KEY, MeasurementConsentService } from './measurement-consent.service';

describe('MeasurementConsentService', () => {
  beforeEach(() => {
    localStorage.removeItem(MEASUREMENT_CONSENT_STORAGE_KEY);
    localStorage.removeItem('hn.visitorId');
    localStorage.removeItem('hudhudnest.referral.v1');
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.removeItem(MEASUREMENT_CONSENT_STORAGE_KEY);
    localStorage.removeItem('hn.visitorId');
  });

  it('does not persist before the country is known, and asks in the EU', () => {
    const service = TestBed.inject(MeasurementConsentService);
    expect(service.canPersist()).toBeFalse();
    expect(service.showPrompt()).toBeFalse();
    service.setCountry('DE');
    expect(service.canPersist()).toBeFalse();
    expect(service.showPrompt()).toBeTrue();
  });

  it('treats an unknown country and Türkiye as requiring consent, and Syria as not', () => {
    const service = TestBed.inject(MeasurementConsentService);
    service.setCountry(null);
    expect(service.showPrompt()).toBeTrue();
    service.setCountry('TR');
    expect(service.showPrompt()).toBeTrue();
    service.setCountry('SY');
    expect(service.showPrompt()).toBeFalse();
    expect(service.canPersist()).toBeTrue();
  });

  it('keeps the visitor id in memory only until consent, and writes it once consent is given', () => {
    const consent = TestBed.inject(MeasurementConsentService);
    consent.setCountry('FR');
    const id = TestBed.inject(VisitorIdService).get();
    expect(id.length).toBeGreaterThan(15);
    expect(localStorage.getItem('hn.visitorId')).toBeNull();
    consent.grant();
    TestBed.resetTestingModule();
    TestBed.inject(VisitorIdService).get();
    expect(localStorage.getItem('hn.visitorId')).not.toBeNull();
  });

  it('declining removes values already stored and is remembered', () => {
    localStorage.setItem('hn.visitorId', 'abcdefabcdefabcdef12');
    const consent = TestBed.inject(MeasurementConsentService);
    consent.deny();
    expect(localStorage.getItem('hn.visitorId')).toBeNull();
    expect(JSON.parse(localStorage.getItem(MEASUREMENT_CONSENT_STORAGE_KEY)!).choice).toBe('denied');
    TestBed.resetTestingModule();
    expect(TestBed.inject(MeasurementConsentService).choice()).toBe('denied');
  });

  it('an unset choice in a consent country clears values stored earlier', () => {
    localStorage.setItem('hudhudnest.referral.v1', JSON.stringify({ code: 'X', capturedAt: Date.now() }));
    TestBed.inject(MeasurementConsentService).setCountry('AT');
    expect(localStorage.getItem('hudhudnest.referral.v1')).toBeNull();
    expect(TestBed.inject(ReferralCodeService)).toBeTruthy();
  });
});
