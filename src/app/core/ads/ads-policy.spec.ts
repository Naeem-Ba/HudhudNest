import { AdEligibilityInput, evaluateAdEligibility, pathOnly } from './ads-policy';
import { PLACEMENT_ROUTES } from './ads.model';

describe('evaluateAdEligibility', () => {
  const ok: AdEligibilityInput = {
    masterEnabled: true,
    platformEnabled: true,
    idsPresent: true,
    placement: 'search-results',
    path: '/properties',
    online: true,
    consent: 'granted',
    loadFailed: false
  };

  it('allows a request only when every layer agrees', () => {
    expect(evaluateAdEligibility(ok)).toEqual({ allowed: true });
  });

  it('blocks on each failing layer with its own reason', () => {
    const cases: Array<[Partial<AdEligibilityInput>, string]> = [
      [{ masterEnabled: false }, 'master-disabled'],
      [{ platformEnabled: false }, 'platform-disabled'],
      [{ path: '/auth/login' }, 'placement-not-allowed'],
      [{ idsPresent: false }, 'missing-ids'],
      [{ loadFailed: true }, 'load-failed'],
      [{ online: false }, 'offline'],
      [{ consent: 'unknown' }, 'consent-unknown'],
      [{ consent: 'denied' }, 'consent-denied']
    ];
    for (const [patch, reason] of cases) {
      expect(evaluateAdEligibility({ ...ok, ...patch })).toEqual({ allowed: false, reason: reason as never });
    }
  });

  it('treats "not-required" (native, outside consent regions) as usable consent', () => {
    expect(evaluateAdEligibility({ ...ok, consent: 'not-required' }).allowed).toBeTrue();
  });

  it('is off when the master switch is off even if everything else is ready', () => {
    expect(evaluateAdEligibility({ ...ok, masterEnabled: false }).allowed).toBeFalse();
  });

  it('search placement matches the results page only, ignoring query and fragment', () => {
    expect(pathOnly('/properties?page=2#top')).toBe('/properties');
    expect(evaluateAdEligibility({ ...ok, path: '/properties?city=damascus' }).allowed).toBeTrue();
    expect(evaluateAdEligibility({ ...ok, path: '/properties/42' }).allowed).toBeFalse();
  });

  it('detail placement matches a listing page but never the create/edit routes', () => {
    const detail = { ...ok, placement: 'property-detail' as const };
    expect(evaluateAdEligibility({ ...detail, path: '/properties/42' }).allowed).toBeTrue();
    expect(evaluateAdEligibility({ ...detail, path: '/properties/new' }).allowed).toBeFalse();
    expect(evaluateAdEligibility({ ...detail, path: '/properties/edit/42' }).allowed).toBeFalse();
    expect(evaluateAdEligibility({ ...detail, path: '/properties' }).allowed).toBeFalse();
  });

  it('never matches sensitive routes for either placement', () => {
    const sensitive = [
      '/auth/login', '/auth/register', '/properties/edit/7', '/messages', '/messages/3', '/checkout', '/pricing',
      '/services', '/profile', '/settings', '/admin', '/my-listings', '/notifications', '/short-stay/bookings',
      '/investments', '/account-deletion', '/agency/edit'
    ];
    for (const route of Object.values(PLACEMENT_ROUTES)) {
      for (const path of sensitive) expect(route.test(path)).withContext(path).toBeFalse();
    }
  });
});
