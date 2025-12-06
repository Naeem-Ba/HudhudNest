import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ContactDto {
  Name: string;
  Email: string;
  Subject: string;
  Message: string;
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

  getMessageById(id: number) {
  return this.http.get(`${this.apiUrl}/${id}`);
  }
  markAsRead(id: number): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/read`, {});
  }

  deleteMessage(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
