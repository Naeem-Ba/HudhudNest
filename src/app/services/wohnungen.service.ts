import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable,Subject } from 'rxjs';

export interface Wohnung {
  Id?: number;
  Titel: string;
  Beschreibung: string;
  Adresse: string;
  Stadt?: string;
  PLZ?: string;
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
  Energieausweis?: 0;
  Zustand?: 0; 
  Status?: 0; 
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
  private apiUrl = 'https://localhost:7136/api/wohnungen'; 

   // 🟢 Subject لإرسال إشعارات عند إضافة شقة جديدة
  private wohnungAddedSource = new Subject<Wohnung>();
  wohnungAdded$ = this.wohnungAddedSource.asObservable();

  constructor(private http: HttpClient) {}
   // GET ALL
  // ----------------------------------------------------
  getWohnungen(): Observable<Wohnung[]> {
    return this.http.get<Wohnung[]>(this.apiUrl);
  }
  // GET BY ID
  // ----------------------------------------------------
  getWohnung(id: number): Observable<Wohnung> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.get<Wohnung>(url);
  }

   // ADD WOHNUNG (WITH IMAGES)
  // ---------------------------------------------------
   addWohnung(formData: FormData): Observable<any> {
    return new Observable(observer => {
      this.http.post<Wohnung>(this.apiUrl, formData).subscribe({
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
    files.forEach(file => formData.append("files", file));

    return this.http.post<Bild[]>(
      `${this.apiUrl}/${wohnungId}/bilder`,
      formData);
}

}
