import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './core/api.service'; 


export interface ContactDto {
  Name: string;
  Email: string;
  Subject: string;
  Message: string;
}

@Injectable({ providedIn: 'root' })
export class ContactService {
  
  private readonly endpoint = '/contact';
  constructor(private api: ApiService) {}

  sendContact(payload: ContactDto): Observable<any> {
    return this.api.post(this.endpoint, payload);
  }

  getMessages(): Observable<any> {
    return this.api.get<any>(this.endpoint);
  }

  getMessageById(id: number) {
  return this.api.get(`${this.endpoint}/${id}`);
  }
  markAsRead(id: number): Observable<any> {
    return this.api.put(`${this.endpoint}/${id}/read`, {});
  }

  deleteMessage(id: number): Observable<any> {
    return this.api.delete(`${this.endpoint}/${id}`);
  }
}
