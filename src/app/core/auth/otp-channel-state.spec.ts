// =====================================================================
// ✅ Unit Tests – otp-channel-state.spec.ts
// The channel picker's brain: which channels are shown, which one is selected by default, that the
// list is re-fetched for the number being typed, and that any failure leaves the old SMS-only page.
// =====================================================================
import { DestroyRef, inject } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { OtpChannelOption, normalizeOtpChannel, normalizeOtpChannels } from '../models/auth.model';
import { OtpChannelState } from './otp-channel-state';
import { PhoneAuthApiService } from './phone-auth-api.service';

function option(channel: OtpChannelOption['channel'], patch: Partial<OtpChannelOption> = {}): OtpChannelOption {
  return { channel, available: true, recommended: false, reason: null, unavailableCountryCodes: [], ...patch };
}

const SMS_ONLY = [
  option('Sms'),
  option('Telegram', { available: false, reason: 'CHANNEL_DISABLED' }),
  option('WhatsApp', { available: false, reason: 'CHANNEL_DISABLED' })
];

const SYRIA = [
  option('Sms'),
  option('Telegram', { recommended: true }),
  option('WhatsApp', { available: false, reason: 'COUNTRY_NOT_SUPPORTED', unavailableCountryCodes: ['+963', '+53'] })
];

describe('OtpChannelState', () => {
  let api: jasmine.SpyObj<PhoneAuthApiService>;
  let control: FormControl<string>;
  let state: OtpChannelState;

  function create(): OtpChannelState {
    return TestBed.runInInjectionContext(() => new OtpChannelState(api, inject(DestroyRef)));
  }

  beforeEach(() => {
    api = jasmine.createSpyObj<PhoneAuthApiService>('PhoneAuthApiService', ['getOtpChannels']);
    api.getOtpChannels.and.returnValue(of(SMS_ONLY));
    control = new FormControl('', { nonNullable: true });
    state = create();
  });

  it('shows no picker when the deployment only offers SMS — the page stays exactly as it was', fakeAsync(() => {
    state.watch(control);
    tick(400);

    expect(state.options().map(o => o.channel)).toEqual(['Sms']);
    expect(state.showPicker()).toBeFalse();
    expect(state.selected()).toBe('Sms');
  }));

  it('hides channels the deployment has switched off, but keeps ones unavailable for the country', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(of(SYRIA));
    state.watch(control);
    tick(400);

    expect(state.options().map(o => o.channel)).toEqual(['Sms', 'Telegram', 'WhatsApp']);
    expect(state.showPicker()).toBeTrue();
  }));

  it('selects the recommended channel first, then the first available one, then SMS', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(of(SYRIA));
    state.watch(control);
    tick(400);
    expect(state.selected()).toBe('Telegram');

    api.getOtpChannels.and.returnValue(of([option('Sms'), option('Telegram')]));
    control.setValue('+4915772378923');
    tick(400);
    expect(state.selected()).toBe('Sms');

    api.getOtpChannels.and.returnValue(of([]));
    control.setValue('+4915772378924');
    tick(400);
    expect(state.selected()).toBe('Sms');
  }));

  it('asks the API about the number only once it is a complete number, and only after typing pauses', fakeAsync(() => {
    state.watch(control);
    tick(400);
    api.getOtpChannels.calls.reset();

    control.setValue('+9');
    control.setValue('+96');
    control.setValue('+9639');
    tick(400);
    expect(api.getOtpChannels).not.toHaveBeenCalled();

    control.setValue('0933 123 456');
    tick(200);
    expect(api.getOtpChannels).not.toHaveBeenCalled();
    tick(200);
    expect(api.getOtpChannels).toHaveBeenCalledOnceWith('+963933123456');
  }));

  it('keeps the person\'s own choice while it stays available for the new number', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(of(SYRIA));
    state.watch(control);
    tick(400);

    state.select('Sms');
    control.setValue('+963933123456');
    tick(400);

    expect(state.selected()).toBe('Sms');
  }));

  it('moves off a channel that is not available for the new number', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(of([option('Sms'), option('Telegram'), option('WhatsApp', { recommended: false })]));
    state.watch(control);
    tick(400);
    state.select('WhatsApp');
    expect(state.selected()).toBe('WhatsApp');

    api.getOtpChannels.and.returnValue(of(SYRIA));
    control.setValue('+963933123456');
    tick(400);

    expect(state.selected()).toBe('Telegram');
  }));

  it('ignores an attempt to select an unavailable or hidden channel', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(of(SYRIA));
    state.watch(control);
    tick(400);

    state.select('WhatsApp');
    expect(state.selected()).toBe('Telegram');

    api.getOtpChannels.and.returnValue(of(SMS_ONLY));
    control.setValue('+4915772378923');
    tick(400);
    state.select('Telegram');
    expect(state.selected()).toBe('Sms');
  }));

  it('falls back to the SMS-only page when the channel list cannot be loaded', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(throwError(() => ({ status: 0 })));
    state.watch(control);
    tick(400);

    expect(state.showPicker()).toBeFalse();
    expect(state.selected()).toBe('Sms');
  }));

  it('lists the other available channels as fallbacks, never unavailable ones or the one already used', fakeAsync(() => {
    api.getOtpChannels.and.returnValue(of(SYRIA));
    state.watch(control);
    tick(400);

    expect(state.alternativesTo('Telegram').map(o => o.channel)).toEqual(['Sms']);
    expect(state.alternativesTo('Sms').map(o => o.channel)).toEqual(['Telegram']);
  }));
});

describe('normalizeOtpChannels', () => {
  it('reads camelCase and PascalCase, in any letter case, and drops what it does not know', () => {
    const result = normalizeOtpChannels({
      Channels: [
        { Channel: 'Sms', Available: true, Recommended: false, Reason: null, UnavailableCountryCodes: [] },
        { channel: 'telegram', available: true, recommended: true, reason: null, unavailableCountryCodes: ['+7', 5] },
        { channel: 'whatsapp', available: false, recommended: false, reason: 'COUNTRY_NOT_SUPPORTED', unavailableCountryCodes: ['+963'] },
        { channel: 'Carrier pigeon', available: true },
        null
      ]
    });

    expect(result.map(o => o.channel)).toEqual(['Sms', 'Telegram', 'WhatsApp']);
    expect(result[1].unavailableCountryCodes).toEqual(['+7']);
    expect(result[2].reason).toBe('COUNTRY_NOT_SUPPORTED');
    expect(result[2].available).toBeFalse();
  });

  it('turns any unusable payload into an empty list', () => {
    expect(normalizeOtpChannels(undefined)).toEqual([]);
    expect(normalizeOtpChannels({})).toEqual([]);
    expect(normalizeOtpChannels({ channels: 'nope' })).toEqual([]);
  });

  it('ignores an unknown unavailability reason instead of trusting it', () => {
    expect(normalizeOtpChannels({ channels: [{ channel: 'Sms', available: false, reason: 'SOMETHING' }] })[0].reason).toBeNull();
  });

  it('normalizeOtpChannel is case-insensitive and null for anything else', () => {
    expect(normalizeOtpChannel('WHATSAPP')).toBe('WhatsApp');
    expect(normalizeOtpChannel('fax')).toBeNull();
    expect(normalizeOtpChannel(3)).toBeNull();
  });
});
