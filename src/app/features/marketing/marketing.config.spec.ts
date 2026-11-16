import { heroCtas, platformUrl, startCards } from './marketing.config';

describe('marketing call-to-action logic', () => {
  describe('heroCtas', () => {
    it('listingsLive=false: gold primary lists a property on the platform, outline secondary opens the waitlist, nothing links to search', () => {
      const { primary, secondary } = heroCtas(false);
      expect(primary.labelKey).toBe('SITE.HERO.CTA_PUBLISH');
      expect(primary.target).toEqual({ kind: 'platform', path: '/property-form' });
      expect(secondary?.labelKey).toBe('SITE.HERO.CTA_NOTIFY');
      expect(secondary?.target).toEqual({ kind: 'waitlist', interest: null });
      expect(JSON.stringify([primary, secondary])).not.toContain('/properties');
    });

    it('listingsLive=true: primary discovers properties in the search, secondary lists a property, no waitlist', () => {
      const { primary, secondary } = heroCtas(true);
      expect(primary.labelKey).toBe('SITE.HERO.CTA_EXPLORE');
      expect(primary.target).toEqual({ kind: 'route', path: '/properties' });
      expect(secondary?.target).toEqual({ kind: 'platform', path: '/property-form' });
      expect(JSON.stringify([primary, secondary])).not.toContain('waitlist');
    });
  });

  describe('startCards', () => {
    it('listingsLive=false: buy/rent/short open the waitlist with the matching interest, the 4th card goes to the platform', () => {
      const cards = startCards(false);
      expect(cards.map(c => c.key)).toEqual(['BUY', 'RENT', 'SHORT', 'OFFER']);
      expect(cards[0].target).toEqual({ kind: 'waitlist', interest: 'kaufen' });
      expect(cards[1].target).toEqual({ kind: 'waitlist', interest: 'mieten' });
      expect(cards[2].target).toEqual({ kind: 'waitlist', interest: 'kurz' });
      expect(cards[3].target).toEqual({ kind: 'platform', path: '/property-form' });
    });

    it('listingsLive=true: the search cards deep-link with the matching filter', () => {
      const cards = startCards(true);
      expect(cards[0].target).toEqual({ kind: 'route', path: '/properties', query: { listingType: 'ForSale' } });
      expect(cards[1].target).toEqual({ kind: 'route', path: '/properties', query: { listingType: 'ForRent' } });
      expect(cards[2].target).toEqual({ kind: 'route', path: '/short-stay' });
    });
  });

  it('platformUrl joins the app origin and a path, and falls back to a relative path when no origin is set', () => {
    expect(platformUrl({ listingsLive: false, appUrl: 'https://hudhudnest.com' }, '/property-form')).toBe('https://hudhudnest.com/property-form');
    expect(platformUrl({ listingsLive: false, appUrl: '' }, '/')).toBe('/');
  });
});
