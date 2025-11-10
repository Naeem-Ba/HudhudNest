import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  constructor(private http: HttpClient) {}

  getWohnungen(): Observable<Wohnung[]> {
    return this.http.get<Wohnung[]>(this.apiUrl);
  }
  getWohnung(id: number): Observable<Wohnung> {
    const url = `${this.apiUrl}/${id}`;
    return this.http.get<Wohnung>(url);
  }

   addWohnung(wohnung: Wohnung): Observable<Wohnung> {
    return this.http.post<Wohnung>(this.apiUrl, wohnung);
  }
}
