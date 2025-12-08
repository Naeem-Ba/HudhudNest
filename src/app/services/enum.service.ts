import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { Router } from '@angular/router';
import { WohnungenService } from './wohnungen.service';
import { catchError, shareReplay } from 'rxjs/operators';

export interface EnumItem {
  id: number;
  name: string;
  label: string;
}


@Injectable({
  providedIn: 'root'
})
export class EnumService {

  private baseUrl = 'https://localhost:7136/api/Enum';
  constructor(private http: HttpClient) {}

  // --------------------------
  //  Zustand Enum
  // --------------------------
  getZustand(): Observable<{ id: number; label: string }[]> {
    return this.http.get<{ id: number; label: string }[]>(
      `${this.baseUrl}/Zustand`
    );
  }

  // --------------------------
  //  Status Enum
  // --------------------------
  getStatus(): Observable<{ id: number; label: string }[]> {
    return this.http.get<{ id: number; label: string }[]>(
      `${this.baseUrl}/Status`
    );
  }

  // --------------------------
  //  Energieausweis Enum
  // --------------------------
  getEnergieausweisTyp(): Observable<{ id: number; label: string }[]> {
    return this.http.get<{ id: number; label: string }[]>(
      `${this.baseUrl}/EnergieausweisTyp`
    );
  }
}
