import { Agency, AgencyBranch } from '../../core/models/agency.model';
import { OfficePlace, buildOfficeJsonLd, officeMetaDescription } from './office-seo';

const URL = 'https://hudhudnest.com/offices/yasmin';

function office(extra: Partial<Agency> = {}): Agency {
  return {
    id: 'a1', name: 'مكتب الياسمين', slug: 'yasmin', countryCode: 'SY', ownerUserId: 'u1', isActive: true,
    memberCount: 1, createdAt: '2026-10-01T00:00:00Z', members: [], ...extra
  } as Agency;
}

const branch = (extra: Partial<AgencyBranch>): AgencyBranch =>
  ({ id: 'b', name: 'Branch', isMain: false, governorateId: 1, ...extra }) as AgencyBranch;

const places: Record<string, OfficePlace> = {
  main: { region: 'دمشق', locality: 'المزة' },
  other: { region: 'حلب', locality: null },
  office: { region: 'دمشق', locality: null }
};

describe('office SEO', () => {
  describe('buildOfficeJsonLd', () => {
    it('is withheld while the office has no address to state', () => {
      expect(buildOfficeJsonLd({ agency: office(), url: URL, placeOf: () => ({}) })).toBeNull();
    });

    it('describes a full office: address of the main branch, links, hours, branches and rating', () => {
      const agency = office({
        description: '<p>مكتب   عائلي</p>',
        logoUrl: 'https://cdn.example/logo.png',
        coverImageUrl: 'https://cdn.example/cover.jpg',
        contactPhone: '+963112223333',
        contactEmail: 'private@example.com',
        website: 'https://yasmin.sy/',
        socialLinks: [
          { network: 'WhatsApp', value: '+963944123456' },
          { network: 'Facebook', value: 'https://facebook.com/yasmin' },
          { network: 'Instagram', value: 'javascript:alert(1)' }
        ],
        workingHours: [
          { day: 'Saturday', ranges: [{ opens: '09:00', closes: '14:00' }, { opens: '17:00', closes: '24:00' }] },
          { day: 'Friday', ranges: [] }
        ],
        branches: [
          branch({ id: 'b2', name: 'Aleppo', latitude: 36.2, longitude: 37.1 }),
          branch({ id: 'b1', name: 'Mezzeh', isMain: true, address: 'Mezzeh highway', latitude: 33.5, longitude: 36.24 }),
          branch({ id: 'b3', name: 'No pin' })
        ]
      });

      const ld = buildOfficeJsonLd({
        agency, url: URL,
        placeOf: b => (b?.id === 'b1' ? places['main'] : b ? places['other'] : places['office']),
        ratingAverage: 4.26, ratingCount: 7
      })!;

      expect(ld['@type']).toBe('RealEstateAgent');
      expect(ld['@id']).toBe(`${URL}#office`);
      expect(ld['description']).toBe('مكتب عائلي');
      expect(ld['image']).toBe('https://cdn.example/cover.jpg');
      expect(ld['logo']).toBe('https://cdn.example/logo.png');
      expect(ld['telephone']).toBe('+963112223333');
      expect(JSON.stringify(ld)).not.toContain('private@example.com');
      expect(ld['address']).toEqual({
        '@type': 'PostalAddress', streetAddress: 'Mezzeh highway', addressLocality: 'المزة', addressRegion: 'دمشق', addressCountry: 'SY'
      });
      expect(ld['geo']).toEqual({ '@type': 'GeoCoordinates', latitude: 33.5, longitude: 36.24 });
      // WhatsApp is a contact channel, not a profile; an unsafe link never gets in.
      expect(ld['sameAs']).toEqual(['https://yasmin.sy/', 'https://facebook.com/yasmin']);
      const hours = ld['openingHoursSpecification'] as { closes: string }[];
      expect(hours.length).toBe(2);
      expect(hours[1].closes).toBe('23:59');
      // Only branches with a map pin become places.
      expect((ld['location'] as unknown[]).length).toBe(2);
      expect(ld['aggregateRating']).toEqual({ '@type': 'AggregateRating', ratingValue: 4.3, reviewCount: 7, bestRating: 5, worstRating: 1 });
    });

    it('falls back to the office place, then its city, and leaves out what is unknown', () => {
      const byPlace = buildOfficeJsonLd({ agency: office({ governorateId: 1 }), url: URL, placeOf: () => places['office'] })!;
      expect(byPlace['address']).toEqual({ '@type': 'PostalAddress', addressRegion: 'دمشق', addressCountry: 'SY' });
      expect('aggregateRating' in byPlace).toBeFalse();
      expect('sameAs' in byPlace).toBeFalse();
      expect('geo' in byPlace).toBeFalse();

      const byCity = buildOfficeJsonLd({ agency: office({ city: 'Damascus' }), url: URL, placeOf: () => ({}) })!;
      expect(byCity['address']).toEqual({ '@type': 'PostalAddress', addressLocality: 'Damascus', addressCountry: 'SY' });
    });

    it('states no rating without ratings', () => {
      const ld = buildOfficeJsonLd({ agency: office({ city: 'Damascus' }), url: URL, placeOf: () => ({}), ratingAverage: 0, ratingCount: 0 })!;
      expect('aggregateRating' in ld).toBeFalse();
    });
  });

  describe('officeMetaDescription', () => {
    it('uses the office text, without markup', () => {
      expect(officeMetaDescription(office({ description: ' <b>Best</b>  office ' }), () => 'x', null)).toBe('Best office');
    });

    it('otherwise builds the line from the name and place', () => {
      const fallback = jasmine.createSpy('fallback').and.callFake((n: string, p: string) => `${n} @ ${p}`);
      expect(officeMetaDescription(office(), fallback, 'المزة، دمشق')).toBe('مكتب الياسمين @ المزة، دمشق');
      expect(officeMetaDescription(office(), fallback, null)).toBe('مكتب الياسمين @ ');
    });
  });
});
