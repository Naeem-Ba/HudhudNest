import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ContactDto {
  name: string;
  email: string;
  subject: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ContactService {
  private apiUrl = 'https://localhost:7136/api/contact';

  constructor(private http: HttpClient) {}

  sendContact(payload: ContactDto): Observable<any> {
    return this.http.post(this.apiUrl, payload);
  }

  getMessages(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }
}
