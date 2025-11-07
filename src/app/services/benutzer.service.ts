import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

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

  private apiUrl = 'https://localhost:7136/api/Benutzer';

  constructor(private http: HttpClient) {}

  register(data: Benutzer): Observable<Benutzer> {
    console.log('Daten gesendet an Backend:', data);
    
    return this.http.post<Benutzer>(this.apiUrl, data).pipe(
      catchError(err => {
        console.error('Fehler bei der Registrierung:', err);
        return throwError(() => err);
      })
    );
  }

  // تسجيل الدخول
  login(data: Benutzer): Observable<Benutzer> {
    return this.http.post<Benutzer>(`${this.apiUrl}/login`, data).pipe(
      map(user => {
        if (!user) throw new Error('Ungültige Anmeldedaten');
        return user;
      }),
      catchError(err => {
        console.error('Fehler beim Login:', err);
        return throwError(() => err);
      })
    );
  }

  // جلب جميع المستخدمين
  getAll(): Observable<Benutzer[]> {
    return this.http.get<Benutzer[]>(this.apiUrl);
  }
}
