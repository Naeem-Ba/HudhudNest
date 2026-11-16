// Shared fixtures for the geo specs: a tiny Damascus catalog (Syria > Damascus > Damascus City > Mazzeh > Villat).
import { GeoLocation, GeoLocationType, GeoNode } from '../../../core/models/geo-location.model';

export function node(id: number, type: GeoLocationType, nameAr: string, nameEn: string, legacy: { gov?: number; district?: number; hood?: number } = {}): GeoNode {
  return {
    id, type, nameAr, nameEn, nameDe: null,
    legacyGovernorateId: legacy.gov ?? null, legacyDistrictId: legacy.district ?? null, legacyNeighborhoodId: legacy.hood ?? null
  };
}

export const SYRIA = node(1, 'Country', 'سوريا', 'Syria');
export const DAMASCUS = node(2, 'Governorate', 'دمشق', 'Damascus', { gov: 3 });
export const DAMASCUS_CITY = node(3, 'City', 'مدينة دمشق', 'Damascus City');
export const MAZZEH = node(4, 'District', 'المزة', 'Mazzeh', { district: 30 });
export const VILLAT = node(5, 'Neighborhood', 'فيلات شرقية', 'Villat Sharqiya', { hood: 300 });
export const AMIN = node(6, 'Street', 'شارع الأمين', 'Al-Amin Street');
export const ALEPPO = node(9, 'Governorate', 'حلب', 'Aleppo', { gov: 4 });

const CHAIN = [SYRIA, DAMASCUS, DAMASCUS_CITY, MAZZEH, VILLAT, AMIN];

/** A catalog place with its breadcrumb up to itself. */
export function place(n: GeoNode): GeoLocation {
  const path = CHAIN.includes(n) ? CHAIN.slice(0, CHAIN.indexOf(n) + 1) : [SYRIA, n];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  return {
    id: n.id, type: n.type, parentId: parent?.id ?? null, countryCode: 'SY', officialName: n.nameAr,
    nameAr: n.nameAr, nameEn: n.nameEn, nameDe: null, latitude: null, longitude: null, path,
    legacy: { governorateId: n.legacyGovernorateId, districtId: n.legacyDistrictId, neighborhoodId: n.legacyNeighborhoodId },
    matchedAlias: null
  };
}
