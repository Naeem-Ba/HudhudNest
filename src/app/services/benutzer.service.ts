import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { BackendApiService } from '../core/services/backend-api.service';

export interface Benutzer {
  Id?: string;
  id?: string;
  Vorname?: string;
  Name?: string;
  DisplayName?: string;
  Email: string;
  Password?: string;
  Phone?: string;
  IsAgent?: boolean;
  ImageUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BenutzerService {
  private readonly endpoint = '/auth';

  constructor(
    private readonly api: BackendApiService,
    private readonly auth: AuthService
  ) {}

  register(data: Benutzer): Observable<any> {
    return this.api.post<any>(`${this.endpoint}/register`, data).pipe(
      catchError(err => throwError(() => err))
    );
  }

  login(data: Benutzer): Observable<any> {
    return this.api.post<any>(`${this.endpoint}/login`, data).pipe(
      map(res => {
        console.log('Backend response:', res);

        if (!res || !res.accessToken) {
          throw new Error('Ungültige Anmeldedaten');
        }

        this.auth.login(res);
        return res;
      }),
      catchError(err => {
        console.error('Login error:', err);
        return throwError(() => err);
      })
    );
  }

  logout(): void {
    this.auth.logout();
  }
}