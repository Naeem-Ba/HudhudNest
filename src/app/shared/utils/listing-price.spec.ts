// Core E2E audit F-3: Home showed the COLD rent while the list and the detail page showed the
// WARM rent for the same listing, and the list/detail printed the currency twice ("US$ USD").
import { formatListingPrice, primaryListingPrice } from './listing-price';

describe('listing price', () => {
  describe('primaryListingPrice', () => {
    it('prefers the purchase price, then the warm rent, then the cold rent', () => {
      expect(primaryListingPrice({ purchasePrice: 90000, warmRent: 450, coldRent: 400 })).toBe(90000);
      expect(primaryListingPrice({ warmRent: 450, coldRent: 400 })).toBe(450);
      expect(primaryListingPrice({ coldRent: 400 })).toBe(400);
    });

    it('treats null and 0 as "not set" and returns null when nothing is priced', () => {
      expect(primaryListingPrice({ purchasePrice: null, warmRent: 0, coldRent: 400 })).toBe(400);
      expect(primaryListingPrice({ purchasePrice: null, warmRent: null, coldRent: null })).toBeNull();
      expect(primaryListingPrice({})).toBeNull();
    });
  });

  describe('formatListingPrice', () => {
    it('prints the currency exactly once', () => {
      const text = formatListingPrice(1450.5, 'USD');
      expect(text).toContain('1');
      expect(text.match(/USD|US\$/g)?.length).toBe(1);
    });

    it('falls back to "number CODE" for a code Intl does not know, still once', () => {
      const text = formatListingPrice(1500, 'XXXX1');
      expect(text.match(/XXXX1/g)?.length).toBe(1);
    });

    it('returns a dash when there is no price', () => {
      expect(formatListingPrice(null, 'USD')).toBe('—');
      expect(formatListingPrice(0, 'USD')).toBe('—');
    });

    it('defaults to SYP when the listing has no currency', () => {
      expect(formatListingPrice(1500, undefined)).toBe(formatListingPrice(1500, 'SYP'));
    });
  });
});
