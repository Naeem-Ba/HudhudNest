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
  Bilder?: { Id: number; Url: string; IsMain: boolean ; AltText?: string;}[];
  Amenities?: { Id: number; AmenityId: number }[];
  OwnerId?: number;
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

  getWohnungen(): Observable<Wohnung[]> {
    return this.http.get<Wohnung[]>(this.apiUrl);
  }
  getWohnung(id: number): Observable<Wohnung> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.get<Wohnung>(url);
  }

   addWohnung(wohnung: Wohnung): Observable<Wohnung> {
    return new Observable(observer => {
      this.http.post<Wohnung>(this.apiUrl, wohnung).subscribe({
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
  uploadWohnungBild(wohnungId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return this.http.post<{ id: number; url: string }>(
    `https://localhost:7136/api/wohnungsbild/${wohnungId}`,
    formData
  );
}
}
