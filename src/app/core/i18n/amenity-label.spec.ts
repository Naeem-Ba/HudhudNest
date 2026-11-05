import { amenityLabel } from './amenity-label';

const translate = (map: Record<string, string>) => ({ instant: (key: string) => map[key] ?? key });

describe('amenityLabel', () => {
  it('translates the stable key when the catalog has it', () => {
    const t = translate({ 'AMENITIES_CATALOG.wifi': 'Internet / Wi-Fi' });
    expect(amenityLabel(t, { name: 'إنترنت / واي فاي', iconName: 'wifi' })).toBe('Internet / Wi-Fi');
  });

  it('also reads the key from `icon`', () => {
    const t = translate({ 'AMENITIES_CATALOG.pool': 'Swimming pool' });
    expect(amenityLabel(t, { name: 'مسبح', icon: 'pool' })).toBe('Swimming pool');
  });

  it('falls back to the stored name for an admin-made amenity that is not in the catalog', () => {
    expect(amenityLabel(translate({}), { name: 'غرفة سينما', iconName: 'cinema-room' })).toBe('غرفة سينما');
  });

  it('falls back to the stored name when there is no key', () => {
    expect(amenityLabel(translate({}), { name: 'مسبح', iconName: null })).toBe('مسبح');
  });
});
