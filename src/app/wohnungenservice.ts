import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Wohnung {
  id: number;
  titel: string;
  beschreibung?: string;
  adresse?: string;
  stadt?: string;
  plz?: string;
  zumMieten: boolean;
  zumKaufen: boolean;
  kaltmiete?: number;
  warmmiete?: number;
  kaufpreis?: number;
  nebenkosten?: number;
  kaution?: number;
  zimmer?: number;
  flaeche?: number;
  geschoss?: number;
  freiAb?: string; // ISO date
  balkon?: boolean;
  aufzug?: boolean;
  stellplatz?: boolean;
  bilder?: { id: number; url: string; isMain: boolean ; altText?: string;}[];
  amenities?: { id: number; name: string }[];
  ownerId?: number;
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
    return this.http.get<Wohnung>(`${this.apiUrl}/${id}`);
  }
}
