import { TestBed } from '@angular/core/testing';

import { WAITLIST_CONFIG, WaitlistConfig, WaitlistService, WaitlistSignup } from './waitlist.service';

const SIGNUP: WaitlistSignup = { contact: 'a@b.de', contactType: 'email', interest: 'mieten', language: 'de' };

function service(config: WaitlistConfig): WaitlistService {
  TestBed.configureTestingModule({ providers: [{ provide: WAITLIST_CONFIG, useValue: config }] });
  return TestBed.inject(WaitlistService);
}

describe('WaitlistService', () => {
  it('is "unavailable" when Supabase is not configured in a real build, and stores nothing', async () => {
    const s = service({ url: '', anonKey: '', mockWhenUnconfigured: false });
    expect(s.isConfigured).toBeFalse();
    expect(await s.submit(SIGNUP)).toBe('unavailable');
  });

  it('uses the dev mock when unconfigured in a local build', async () => {
    const s = service({ url: '', anonKey: '', mockWhenUnconfigured: true });
    expect(await s.submit(SIGNUP)).toBe('ok');
  });

  it('open() remembers the preselected interest and marks the dialog as requested; close() keeps it requested', () => {
    const s = service({ url: '', anonKey: '', mockWhenUnconfigured: true });
    expect(s.requested()).toBeFalse();
    s.open('kurz');
    expect(s.dialog()).toEqual({ open: true, interest: 'kurz' });
    expect(s.requested()).toBeTrue();
    s.close();
    expect(s.dialog().open).toBeFalse();
    expect(s.requested()).toBeTrue();
  });
});
