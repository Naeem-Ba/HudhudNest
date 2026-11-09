import { GeoLocation, GeoLocationType, GeoNode } from '../../../core/models/geo-location.model';

/** A place the user typed that the catalog does not have; proposed to the administrators once the listing is saved. */
export interface GeoProposal {
  type: GeoLocationType;
  parentLocationId: number;
  name: string;
  /** Server-signed provider result, present only for a street the user took from the map. */
  proof: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** What the picker hands the listing form. Only the governorate is mandatory; every other part may be empty. */
export interface GeoPickerValue {
  /** The most specific catalog place chosen (any level). */
  locationId: number | null;
  /** Ids the older parts of the system still use, derived from the chosen place. */
  governorateId: number | null;
  /** English name of the governorate (used to centre a map on it). */
  governorateNameEn: string | null;
  districtId: number | null;
  neighborhoodId: number | null;
  /** Text for the address line (the listing keeps readable names next to the ids). */
  city: string;
  /** The district's name (chosen or typed): kept in the old region column for search. */
  region: string | null;
  districtText: string | null;
  neighborhoodText: string | null;
  street: string;
  proposals: GeoProposal[];
}

/** The saved values of a listing being edited. */
export interface GeoPickerInitial {
  locationId?: number | null;
  governorateId?: number | null;
  /** Old ids of a listing that has no locationId (short stays): resolved through the catalog's legacy links. */
  districtId?: number | null;
  neighborhoodId?: number | null;
  city?: string | null;
  districtText?: string | null;
  neighborhoodText?: string | null;
  street?: string | null;
}

export const EMPTY_GEO_VALUE: GeoPickerValue = {
  locationId: null,
  governorateId: null,
  governorateNameEn: null,
  districtId: null,
  neighborhoodId: null,
  city: '',
  region: null,
  districtText: null,
  neighborhoodText: null,
  street: '',
  proposals: []
};

/** A breadcrumb node as a (path-less) catalog place, so it can feed a field that expects one. */
export function nodeToLocation(node: GeoNode, path: GeoNode[]): GeoLocation {
  const index = path.findIndex(n => n.id === node.id);
  const upTo = index >= 0 ? path.slice(0, index + 1) : [node];
  const parent = upTo.length > 1 ? upTo[upTo.length - 2] : null;
  return {
    id: node.id,
    type: node.type,
    parentId: parent?.id ?? null,
    countryCode: 'SY',
    officialName: node.nameAr || node.nameEn,
    nameAr: node.nameAr,
    nameEn: node.nameEn,
    nameDe: node.nameDe,
    latitude: null,
    longitude: null,
    path: upTo,
    legacy: {
      governorateId: node.legacyGovernorateId,
      districtId: node.legacyDistrictId,
      neighborhoodId: node.legacyNeighborhoodId
    },
    matchedAlias: null
  };
}
