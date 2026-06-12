import { Injectable } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import { ApiService } from './core/api.service';

export interface Wohnung {
  Id?: any;
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

  OwnerId?: any;
  CreatedAt?: string;
  UpdatedAt?: string;

  Bilder?: Bild[];
  Amenities?: Amenity[];
  Messages?: Message[];
  WohnungAmenities?: WohnungAmenity[];
  Favorites?: Favorite[];
}

export interface Favorite {
  UserId: any;
  WohnungId: any;
}

export interface WohnungAmenity {
  Id: any;
  WohnungId: any;
  Url: string;
  AmenityId: any;
}

export interface Bild {
  Id: any;
  WohnungId: any;
  Url: string;
  IsMain: boolean;
  AltText?: string;
}

export interface Message {
  Id: any;
  WohnungId: any;
  UserId?: any;
  SenderName?: string;
  SenderEmail?: string;
  Message: string;
}

export interface Amenity {
  Id: any;
  Name: any;
}

@Injectable({
  providedIn: 'root'
})
export class WohnungenService {
  private readonly endpoint = '/properties';

  private readonly wohnungAddedSource = new Subject<Wohnung>();
  readonly wohnungAdded$ = this.wohnungAddedSource.asObservable();

  constructor(private readonly api: ApiService) {}

  getWohnungen(): Observable<Wohnung[]> {
    return this.api.get<any>(this.endpoint).pipe(
      map(response => this.extractItems(response).map(item => this.toWohnung(item)))
    );
  }

  getWohnung(id: any): Observable<Wohnung> {
    return this.api.get<any>(`${this.endpoint}/${id}`).pipe(
      map(item => this.toWohnung(item))
    );
  }

  addWohnung(formData: FormData): Observable<any> {
    return new Observable(observer => {
      this.api.post<any>(this.endpoint, formData).subscribe({
        next: res => {
          const mapped = this.toWohnung(res);
          this.wohnungAddedSource.next(mapped);
          observer.next(mapped);
          observer.complete();
        },
        error: err => observer.error(err)
      });
    });
  }

  uploadWohnungBilder(wohnungId: any, files: File[]): Observable<Bild[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    files.forEach(file => formData.append('Images', file));

    return this.api.post<any[]>(`${this.endpoint}/${wohnungId}/images`, formData).pipe(
      map(images => (images ?? []).map(image => this.toBild(image, wohnungId)))
    );
  }

  updateWohnung(id: any, formData: FormData): Observable<any> {
    return this.api.put(`${this.endpoint}/${id}`, formData);
  }

  getMyWohnungen(): Observable<Wohnung[]> {
    return this.api.get<any>(this.endpoint).pipe(
      map(response => this.extractItems(response).map(item => this.toWohnung(item)))
    );
  }

  deleteWohnung(id: any): Observable<any> {
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
    const id = property?.Id ?? property?.id;
    const listingType = property?.ListingType ?? property?.listingType ?? '';

    const images = property?.Images ?? property?.images ?? property?.Bilder ?? property?.bilder ?? [];

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

      ZumMieten: property?.ZumMieten ?? String(listingType).toLowerCase().includes('rent'),
      ZumKaufen: property?.ZumKaufen ?? String(listingType).toLowerCase().includes('sale'),

      Kaltmiete: this.toNumber(property?.Kaltmiete ?? property?.ColdRent ?? property?.coldRent),
      Warmmiete: this.toNumber(property?.Warmmiete ?? property?.WarmRent ?? property?.warmRent),
      Kaufpreis: this.toNumber(property?.Kaufpreis ?? property?.PurchasePrice ?? property?.purchasePrice),
      Nebenkosten: this.toNumber(property?.Nebenkosten),
      Kaution: this.toNumber(property?.Kaution),

      Zimmer: this.toNumber(property?.Zimmer ?? property?.Rooms ?? property?.rooms),
      Flaeche: this.toNumber(property?.Flaeche ?? property?.Area ?? property?.area),
      Geschoss: this.toNumber(property?.Geschoss ?? property?.Floor ?? property?.floor),
      FreiAb: property?.FreiAb ?? property?.AvailableFrom ?? property?.availableFrom,

      Balkon: property?.Balkon ?? property?.HasBalcony ?? property?.hasBalcony ?? false,
      Aufzug: property?.Aufzug ?? property?.HasElevator ?? property?.hasElevator ?? false,
      Stellplatz: property?.Stellplatz ?? property?.HasParkingSpace ?? property?.hasParkingSpace ?? false,
      Heizung: property?.Heizung ?? property?.HeatingType ?? property?.heatingType ?? '',

      OwnerId: property?.OwnerId ?? property?.ownerId,
      CreatedAt: property?.CreatedAt ?? property?.createdAt,
      UpdatedAt: property?.UpdatedAt ?? property?.updatedAt,

      Bilder: images.map((image: any) => this.toBild(image, id)),
      Amenities: property?.Amenities ?? property?.amenities ?? [],
      Messages: property?.Messages ?? property?.messages ?? [],
      WohnungAmenities: property?.WohnungAmenities ?? [],
      Favorites: property?.Favorites ?? property?.favorites ?? []
    };
  }

  private toBild(image: any, wohnungId: any): Bild {
    return {
      Id: image?.Id ?? image?.id ?? image?.ImageId ?? image?.imageId ?? '',
      WohnungId: image?.WohnungId ?? image?.propertyId ?? wohnungId,
      Url: image?.Url ?? image?.url ?? image?.ImageUrl ?? image?.imageUrl ?? 'assets/no-image.jpg',
      IsMain: image?.IsMain ?? image?.isMain ?? false,
      AltText: image?.AltText ?? image?.altText ?? ''
    };
  }

  private toNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
}
