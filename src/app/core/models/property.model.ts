export type ListingType = 'ForRent' | 'ForSale' | string;
export type PropertyStatus = 'Available' | 'Rented' | 'Sold' | string;

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
  currencyCode?: string;
  rooms?: number;
  area?: number;
  floor?: number;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasParkingSpace?: boolean;
  status?: PropertyStatus;
  condition?: string;
  images?: PropertyImage[];
  amenities?: Amenity[];
  ownerId?: string;
  isPublished?: boolean;
  createdAt?: string;
}

export interface PropertyFilterDto {
  page?: number;
  pageSize?: number;
  city?: string;
  countryCode?: string;
  listingType?: string;
  minPrice?: number;
  maxPrice?: number;
  minRooms?: number;
  maxRooms?: number;
}

export interface CreatePropertyDto {
  title: string;
  description?: string;
  street?: string;
  city: string;
  region?: string;
  countryCode: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  listingType: ListingType;
  coldRent?: number;
  warmRent?: number;
  purchasePrice?: number;
  currencyCode: string;
  rooms?: number;
  area?: number;
  floor?: number;
  hasBalcony: boolean;
  hasElevator: boolean;
  hasParkingSpace: boolean;
  condition?: string;
}
