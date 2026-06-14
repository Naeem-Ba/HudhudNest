import { Injectable } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import { BackendApiService } from '../core/services/backend-api.service';

export interface Wohnung {
  Id?: string;
  id?: string;

  Titel: string;
  Beschreibung: string;
  Adresse: string;

  Stadt?: any;
  Zustand?: any;
  Status?: any;
  Energieausweis?: any;

  PLZ?: string;
  Latitude?: number;
  Longitude?: number;

  ZumMieten: boolean;
  ZumKaufen?: boolean;

  Kaltmiete?: number;
  Warmmiete?: number;
  Kaufpreis?: number;
  Nebenkosten?: number;
  Kaution?: number;

  Zimmer?: number;
  Flaeche?: number;
  Geschoss?: number;
  FreiAb?: string;

  Balkon?: boolean;
  Aufzug?: boolean;
  Stellplatz?: boolean;
  Heizung?: string;

  OwnerId?: string;
  CreatedAt?: string;
  UpdatedAt?: string;

  Bilder?: Bild[];
  Amenities?: Amenity[];
  Messages?: Message[];
  WohnungAmenities?: WohnungAmenity[];
  Favorites?: Favorite[];
}
export interface PropertySavePayload {
  OwnerId: string;
  Title: string;
  Description: string;
  ListingType: number;
  Street: string;
  City: string;
  Region?: string | null;
  CountryCode: string;
  PostalCode?: string | null;
  Latitude?: number | null;
  Longitude?: number | null;
  ColdRent?: number | null;
  WarmRent?: number | null;
  PurchasePrice?: number | null;
  Deposit?: number | null;
  AdditionalCosts?: number | null;
  CurrencyCode: string;
  Rooms?: number | null;
  Area?: number | null;
  Floor?: number | null;
  HasBalcony: boolean;
  HasElevator: boolean;
  HasParkingSpace: boolean;
  HeatingType: number;
  AvailableFrom?: string | null;
  AmenityIds?: string[] | null;
}

export interface Favorite {
  UserId: string;
  WohnungId: string;
}

export interface WohnungAmenity {
  Id: string;
  WohnungId: string;
  Url: string;
  AmenityId: string;
}

export interface Bild {
  Id: string;
  WohnungId: string;
  Url: string;
  IsMain: boolean;
  AltText?: string;
}

export interface Message {
  Id: string;
  WohnungId: string;
  UserId?: string;
  SenderName?: string;
  SenderEmail?: string;
  Message: string;
}

export interface Amenity {
  Id: string;
  Name: string;
}

@Injectable({
  providedIn: 'root'
})
export class WohnungenService {
  private readonly endpoint = '/properties';

  private readonly wohnungAddedSource = new Subject<Wohnung>();
  readonly wohnungAdded$ = this.wohnungAddedSource.asObservable();

  constructor(private readonly api: BackendApiService) {}

  getWohnungen(): Observable<Wohnung[]> {
    return this.api.get<any>(this.endpoint).pipe(
      map(response => this.extractItems(response).map(item => this.toWohnung(item)))
    );
  }

  getWohnung(id: string): Observable<Wohnung> {
    return this.api.get<any>(`${this.endpoint}/${id}`).pipe(
      map(item => this.toWohnung(item))
    );
  }

  /**
   * مؤقتًا: ما زالت صفحة الإضافة القديمة ترسل FormData.
   * في خطوة لاحقة سنفصل:
   * 1) POST /properties JSON
   * 2) POST /properties/{id}/images FormData files
   */
  addWohnung(payload: PropertySavePayload): Observable<Wohnung> {
  return new Observable(observer => {
    this.api.post<any>(this.endpoint, payload).subscribe({
      next: res => {
        const mapped = this.toWohnung({
          ...payload,
          Id: res?.Id ?? res?.id
        });

        this.wohnungAddedSource.next(mapped);
        observer.next(mapped);
        observer.complete();
      },
      error: err => observer.error(err)
    });
  });
}

  uploadWohnungBilder(wohnungId: string, files: File[]): Observable<Bild[]> {
  const formData = new FormData();

  files.forEach(file => formData.append('files', file));

  return this.api.post<any[]>(`${this.endpoint}/${wohnungId}/images`, formData).pipe(
    map(images => (images ?? []).map(image => this.toBild(image, wohnungId)))
  );
}

publishWohnung(id: string): Observable<void> {
  return this.api.patch<void>(`${this.endpoint}/${id}/publish`, {});
}

  updateWohnung(id: string, payload: Partial<PropertySavePayload>): Observable<void> {
  return this.api.put<void>(`${this.endpoint}/${id}`, {
    PropertyId: id,
    RequestingUserId: '00000000-0000-0000-0000-000000000000',
    ...payload
  });
}

  getMyWohnungen(): Observable<Wohnung[]> {
    return this.api.get<any>(this.endpoint).pipe(
      map(response => this.extractItems(response).map(item => this.toWohnung(item)))
    );
  }

  deleteWohnung(id: string): Observable<any> {
    return this.api.delete(`${this.endpoint}/${id}`);
  }

  private extractItems(response: any): any[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.Items)) {
      return response.Items;
    }

    if (Array.isArray(response?.items)) {
      return response.items;
    }

    if (Array.isArray(response?.Data)) {
      return response.Data;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    return [];
  }

 private toWohnung(property: any): Wohnung {
  const id = this.toStringId(property?.Id ?? property?.id);
  const listingType = property?.ListingType ?? property?.listingType ?? '';
  const listingTypeText = String(listingType).toLowerCase();

  const existingImages =
    property?.Images ??
    property?.images ??
    property?.Bilder ??
    property?.bilder ??
    [];

  const mainImageUrl = property?.MainImageUrl ?? property?.mainImageUrl;
  const imageUrls = property?.ImageUrls ?? property?.imageUrls ?? [];

  const images = [
    ...existingImages,
    ...(mainImageUrl ? [{ Url: mainImageUrl, IsMain: true }] : []),
    ...imageUrls.map((url: string) => ({ Url: url, IsMain: false }))
  ];

  const isRent =
    listingType === 1 ||
    listingType === '1' ||
    listingTypeText.includes('forrent') ||
    listingTypeText.includes('rent');

  const isSale =
    listingType === 2 ||
    listingType === '2' ||
    listingTypeText.includes('forsale') ||
    listingTypeText.includes('sale');

  const isRentAndSale =
    listingType === 3 ||
    listingType === '3' ||
    listingTypeText.includes('rentandsale');

  return {
    Id: id,
    id,

    Titel: property?.Titel ?? property?.Title ?? property?.title ?? '',
    Beschreibung: property?.Beschreibung ?? property?.Description ?? property?.description ?? '',
    Adresse: property?.Adresse ?? property?.Street ?? property?.street ?? '',

    Stadt: property?.Stadt ?? property?.City ?? property?.city ?? '',
    Zustand: property?.Zustand ?? property?.Condition ?? property?.condition ?? '',
    Status: property?.Status ?? property?.PropertyStatus ?? property?.status ?? '',
    Energieausweis: property?.Energieausweis ?? property?.EnergyEfficiency ?? property?.energyEfficiency ?? '',

    PLZ: property?.PLZ ?? property?.PostalCode ?? property?.postalCode ?? '',
    Latitude: this.toNumber(property?.Latitude ?? property?.latitude),
    Longitude: this.toNumber(property?.Longitude ?? property?.longitude),

    ZumMieten: property?.ZumMieten ?? (isRent || isRentAndSale),
    ZumKaufen: property?.ZumKaufen ?? (isSale || isRentAndSale),

    Kaltmiete: this.toNumber(property?.Kaltmiete ?? property?.ColdRent ?? property?.coldRent),
    Warmmiete: this.toNumber(property?.Warmmiete ?? property?.WarmRent ?? property?.warmRent),
    Kaufpreis: this.toNumber(property?.Kaufpreis ?? property?.PurchasePrice ?? property?.purchasePrice),
    Nebenkosten: this.toNumber(property?.Nebenkosten ?? property?.AdditionalCosts ?? property?.additionalCosts),
    Kaution: this.toNumber(property?.Kaution ?? property?.Deposit ?? property?.deposit),

    Zimmer: this.toNumber(property?.Zimmer ?? property?.Rooms ?? property?.rooms),
    Flaeche: this.toNumber(property?.Flaeche ?? property?.Area ?? property?.area),
    Geschoss: this.toNumber(property?.Geschoss ?? property?.Floor ?? property?.floor),
    FreiAb: property?.FreiAb ?? property?.AvailableFrom ?? property?.availableFrom,

    Balkon: property?.Balkon ?? property?.HasBalcony ?? property?.hasBalcony ?? false,
    Aufzug: property?.Aufzug ?? property?.HasElevator ?? property?.hasElevator ?? false,
    Stellplatz: property?.Stellplatz ?? property?.HasParkingSpace ?? property?.hasParkingSpace ?? false,
    Heizung: property?.Heizung ?? property?.HeatingType ?? property?.heatingType ?? '',

    OwnerId: this.toStringId(property?.OwnerId ?? property?.ownerId),
    CreatedAt: property?.CreatedAt ?? property?.createdAt,
    UpdatedAt: property?.UpdatedAt ?? property?.updatedAt,

    Bilder: images.map((image: any) => this.toBild(image, id)),
    Amenities: property?.Amenities ?? property?.amenities ?? [],
    Messages: property?.Messages ?? property?.messages ?? [],
    WohnungAmenities: property?.WohnungAmenities ?? [],
    Favorites: property?.Favorites ?? property?.favorites ?? []
  };
}

  private toBild(image: any, wohnungId: string): Bild {
    return {
      Id: this.toStringId(image?.Id ?? image?.id ?? image?.ImageId ?? image?.imageId),
      WohnungId: this.toStringId(image?.WohnungId ?? image?.propertyId ?? wohnungId),
      Url: image?.Url ?? image?.url ?? image?.ImageUrl ?? image?.imageUrl ?? 'assets/no-image.jpg',
      IsMain: image?.IsMain ?? image?.isMain ?? false,
      AltText: image?.AltText ?? image?.altText ?? ''
    };
  }

  private toStringId(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    return String(value);
  }

  private toNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}