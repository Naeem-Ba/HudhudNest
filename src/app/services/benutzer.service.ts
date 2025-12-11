import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AuthService } from './auth.service';

export interface Benutzer {
  Id?: number;
  Name?: string;
  Email: string;
  PasswordHash: string;
}

@Injectable({
  providedIn: 'root'
})
export class BenutzerService {

  private apiUrl = 'https://localhost:7136/api/Benutzer/';

  constructor(private http: HttpClient, private auth: AuthService) {}

  register(data: Benutzer): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}register`, data).pipe(
      catchError(err => throwError(() => err))
    );
  }
login(data: Benutzer): Observable<any> {
  return this.http.post<any>(`${this.apiUrl}login`, data).pipe(

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

//  login(data: Benutzer): Observable<any> {
//    return this.http.post<any>(`${this.apiUrl}login`, data).pipe(
//      map(res => {
//        if (!res || !res.token) throw new Error('Ungültige Anmeldedaten');

//        this.auth.login(res);
//        return res;
//      }),
//      catchError(err => throwError(() => err))
//    );
//  }

  logout() {
    this.auth.logout();
  }
}
