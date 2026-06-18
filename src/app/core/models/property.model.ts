export type ListingType = 'ForRent' | 'ForSale' | 'RentAndSale' | number | string;
export type PropertyStatus = 'Draft' | 'Available' | 'Rented' | 'Sold' | 'Archived' | number | string;

export interface PropertyImage {
  id?: string;
  url: string;
  isMain?: boolean;
  altText?: string;
}

export interface Amenity {
  id: string;
  name: string;
  icon?: string;
}

export interface Property {
  id: string;
  title: string;
  description?: string;
  street?: string;
  city: string;
  region?: string;
  countryCode?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  listingType?: ListingType;
  coldRent?: number;
  warmRent?: number;
  purchasePrice?: number;
  deposit?: number;
  additionalCosts?: number;
  currencyCode?: string;
  rooms?: number;
  area?: number;
  floor?: number;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasParkingSpace?: boolean;
  heatingType?: number | string;
  energyEfficiency?: number | string;
  status?: PropertyStatus;
  condition?: number | string;
  images?: PropertyImage[];
  mainImageUrl?: string;
  imageUrls?: string[];
  amenities?: Amenity[];
  ownerId?: string;
  availableFrom?: string;
  isPublished?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PropertyFilterDto {
  page?: number;
  pageSize?: number;
  city?: string;
  countryCode?: string;
  listingType?: string | number;
  status?: string | number;
  ownerId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
  minArea?: number;
  maxArea?: number;
  isPublished?: boolean;
}

export interface CreatePropertyDto {
  title: string;
  description?: string;
  listingType: ListingType;
  street?: string;
  city: string;
  region?: string | null;
  countryCode: string;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  coldRent?: number | null;
  warmRent?: number | null;
  purchasePrice?: number | null;
  deposit?: number | null;
  additionalCosts?: number | null;
  currencyCode: string;
  rooms?: number | null;
  area?: number | null;
  floor?: number | null;
  hasBalcony: boolean;
  hasElevator: boolean;
  hasParkingSpace: boolean;
  heatingType?: number | string;
  energyEfficiency?: number | string;
  condition?: number | string;
  availableFrom?: string | null;
  amenityIds?: string[] | null;
}
