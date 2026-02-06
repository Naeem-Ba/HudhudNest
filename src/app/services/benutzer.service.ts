import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { ApiService } from './core/api.service';


export interface Benutzer {
  Id?: number;
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

  private readonly endpoint = '/Auth';
  constructor(private api: ApiService, private auth: AuthService) {}

  register(data: Benutzer): Observable<any> {
    return this.api.post<any>(`${this.endpoint}/register`, data).pipe(
      catchError(err => throwError(() => err))
    );
  }
login(data: Benutzer): Observable<any> {
  return this.api.post<any>(`${this.endpoint}/login`, data).pipe(

    map(res => {
      console.log("🔥 Backend response:", res);

      if (!res || !res.token) throw new Error('Ungültige Anmeldedaten');

      this.auth.login(res);
      return res;
    }),

    catchError(err => {
      console.error("❌ Login error:", err);
      return throwError(() => err);
    })
  );
}

  logout() {
    this.auth.logout();
  }
}
