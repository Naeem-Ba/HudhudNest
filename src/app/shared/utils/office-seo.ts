// Structured data (schema.org) and search description for a public office page (/offices/:slug).
// Pure functions: the page passes in what it already has (the office, the resolved place names, the ratings
// summary) and gets plain objects back, so every rule here is unit-tested without a browser.
import { Agency, AgencyBranch, WEEK_DAYS } from '../../core/models/agency.model';
import { socialHref } from './agency-profile';

/** The resolved names of a branch's place, in the page language. Both can be missing (lookups not loaded yet). */
export interface OfficePlace {
  region?: string | null;
  locality?: string | null;
}

export interface OfficeJsonLdInput {
  agency: Agency;
  /** The canonical page URL, e.g. https://hudhudnest.com/offices/yasmin. */
  url: string;
  /** Place names for a branch (by its ids), or for the office itself when called with null. */
  placeOf: (branch: AgencyBranch | null) => OfficePlace;
  ratingAverage?: number | null;
  ratingCount?: number | null;
}

const MAX_DESCRIPTION = 500;

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function httpsOnly(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && /^https:\/\//i.test(value) ? value : undefined;
}

function isNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Drops undefined, null and empty-string values so the JSON-LD carries only what is really known. */
function compact<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
  ) as Partial<T>;
}

function postalAddress(street: string | null | undefined, place: OfficePlace, countryCode: string | null | undefined) {
  return compact({
    '@type': 'PostalAddress',
    streetAddress: clean(street) || undefined,
    addressLocality: clean(place.locality) || undefined,
    addressRegion: clean(place.region) || undefined,
    addressCountry: (countryCode || 'SY').toUpperCase()
  });
}

function geo(branch: AgencyBranch | null | undefined) {
  return branch && isNum(branch.latitude) && isNum(branch.longitude)
    ? { '@type': 'GeoCoordinates', latitude: branch.latitude, longitude: branch.longitude }
    : undefined;
}

/** schema.org closes at most at 23:59; the office hours use 24:00 for "until midnight". */
function schemaTime(value: string): string {
  return value === '24:00' ? '23:59' : value;
}

/**
 * schema.org RealEstateAgent for the office, or null when the office has no address worth stating. The spec rule:
 * structured data only once the name and the address are known, so a half-filled office never publishes a vague or
 * wrong place. The address is the main branch's (else the first branch's), or the office's own governorate/city.
 *
 * Only facts the page itself shows go in: no member names, no e-mail address, no listing counts. The rating is the
 * visitors' rating of the office collected on this platform, included only when there is at least one.
 */
export function buildOfficeJsonLd(input: OfficeJsonLdInput): Record<string, unknown> | null {
  const { agency, url } = input;
  const name = clean(agency.name);
  if (!name) return null;

  const branches = agency.branches ?? [];
  const main = branches.find(b => b.isMain) ?? branches[0] ?? null;
  const officePlace = input.placeOf(main);
  const address = postalAddress(main?.address, officePlace.region || officePlace.locality ? officePlace : { locality: agency.city }, agency.countryCode);
  if (!address.addressRegion && !address.addressLocality && !address.streetAddress) return null;

  const sameAs = [
    httpsOnly(agency.website),
    ...(agency.socialLinks ?? [])
      .filter(link => link.network !== 'WhatsApp')
      .map(link => httpsOnly(socialHref(link)))
  ].filter((v): v is string => !!v);

  const hours = (agency.workingHours ?? []).flatMap(day =>
    WEEK_DAYS.includes(day.day)
      ? day.ranges.map(r => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: `https://schema.org/${day.day}`,
          opens: r.opens,
          closes: schemaTime(r.closes)
        }))
      : []
  );

  const locations = branches
    .filter(b => geo(b))
    .map(b => compact({
      '@type': 'Place',
      name: clean(b.name) || undefined,
      address: postalAddress(b.address, input.placeOf(b), agency.countryCode),
      geo: geo(b),
      telephone: clean(b.contactPhone) || undefined
    }));

  const count = input.ratingCount ?? 0;
  const rating = count > 0 && isNum(input.ratingAverage) && input.ratingAverage > 0
    ? {
        '@type': 'AggregateRating',
        ratingValue: Math.round(input.ratingAverage * 10) / 10,
        reviewCount: count,
        bestRating: 5,
        worstRating: 1
      }
    : undefined;

  const description = clean(agency.description);

  return compact({
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': `${url}#office`,
    name,
    url,
    description: description ? description.slice(0, MAX_DESCRIPTION) : undefined,
    logo: httpsOnly(agency.logoUrl),
    image: httpsOnly(agency.coverImageUrl) ?? httpsOnly(agency.logoUrl),
    telephone: clean(agency.contactPhone) || clean(main?.contactPhone) || undefined,
    address,
    geo: geo(main),
    sameAs,
    openingHoursSpecification: hours,
    location: locations,
    aggregateRating: rating
  });
}

/**
 * The meta description: the office's own text when it has one, otherwise one factual line built from its name and
 * place (the caller translates the template). Never invented details such as listing counts that may be stale.
 */
export function officeMetaDescription(agency: Agency, fallback: (name: string, place: string) => string, place: string | null): string {
  const own = clean(agency.description);
  if (own) return own;
  return fallback(clean(agency.name), clean(place));
}
