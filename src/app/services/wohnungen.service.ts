import { Injectable } from '@angular/core';
import { Observable,Subject } from 'rxjs';
import { ApiService } from './core/api.service'; 

export interface Wohnung {
  Id?: number;
  Titel: string;
  Beschreibung: string;
  Adresse: string;

   Stadt?: number;          // ENUM: STADT
  Zustand?: number;        // ENUM: ZUSTAND
  Status?: number;         // ENUM: STATUS
  Energieausweis?: number; // ENUM: ENERGIEAUSWEISTYP

  PLZ?: string;
  Latitude?: number,
  Longitude?: number,

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
  FreiAb?: string; // ISO date
  
  Balkon?: boolean;
  Aufzug?: boolean;
  Stellplatz?: boolean;
  Heizung?: string;
  
  OwnerId?: number;
  CreatedAt?: string; // ISO date
  UpdatedAt?: string; // ISO date
  Bilder?: Bild[];
  Amenities?: Amenity[];
  Messages?: Message[];
  WohnungAmenities?: WohnungAmenity[];
  Favorites?: Favorite[];
}
export interface Favorite {
  UserId: number;
  WohnungId:number;
}
export interface WohnungAmenity {
  Id: number;
  WohnungId:number;
  Url: string;
  AmenityId: number;
}
export interface Bild {
  Id: number;
  WohnungId:number;
  Url: string;
  IsMain: boolean;
  AltText?: string;
}
export interface Message {
  Id: number;
  WohnungId: number;
  UserId?: number;
  SenderName?: string;
  SenderEmail?: string;
  Message: string;
}

export interface Amenity {
  Id: number;
  Name: number;
}
@Injectable({
  providedIn: 'root'
})

export class WohnungenService {
 
  private readonly endpoint = '/wohnungen';

   // 🟢 Subject لإرسال إشعارات عند إضافة شقة جديدة
  private wohnungAddedSource = new Subject<Wohnung>();
  wohnungAdded$ = this.wohnungAddedSource.asObservable();

  constructor(private api: ApiService) {}
   // GET ALL
  // ----------------------------------------------------
  getWohnungen(): Observable<Wohnung[]> {
    return this.api.get<Wohnung[]>(this.endpoint);
  }
  // GET BY ID
  // ----------------------------------------------------
  getWohnung(id: number): Observable<Wohnung> {
    const url = `${this.endpoint}/${id}`;
    return this.api.get<Wohnung>(url);
  }

   // ADD WOHNUNG (WITH IMAGES)
  // ---------------------------------------------------
   addWohnung(formData: FormData): Observable<any> {
    return new Observable(observer => {
      this.api.post<Wohnung>(this.endpoint, formData).subscribe({
        next: (res) => {
          // عند نجاح الحفظ، أرسل الإشعار لباقي المكونات
          this.wohnungAddedSource.next(res);
          observer.next(res);
          observer.complete();
        },
        error: (err) => observer.error(err)
      });
    });
    
  }
   // UPLOAD IMAGES ONLY (CORRECT ENDPOINT)
  // ----------------------------------------------------
 uploadWohnungBilder(wohnungId: number, files: File[]): Observable<Bild[]> {

    const formData = new FormData();
    files.forEach(file => formData.append("Bilder", file));

    return this.api.post<Bild[]>(
      `${this.endpoint}/${wohnungId}/bilder`,
      formData);
}

  // update Wohnung
  // ---------------------------------------------------
updateWohnung(id: number, formData: FormData): Observable<any> {
  return this.api.put(`${this.endpoint}/${id}`, formData);
}

getMyWohnungen() {
  return this.api.get<Wohnung[]>(`${this.endpoint}/mine`);
}

deleteWohnung(id: number) {
  return this.api.delete(`${this.endpoint}/${id}`);
}

}
