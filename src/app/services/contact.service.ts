import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { BackendApiService } from '../core/services/backend-api.service';

export interface ContactDto {
  Name: string;
  Email: string;
  Subject: string;
  Message: string;
}

export interface ContactMessageDto {
  Id?: string;
  id?: string;

  Name?: string;
  name?: string;

  Email?: string;
  email?: string;

  Subject?: string;
  subject?: string;

  Message?: string;
  message?: string;

  IsRead?: boolean;
  isRead?: boolean;

  CreatedAt?: string;
  createdAt?: string;

  SentAt?: string;
sentAt?: string;
}

@Injectable({ providedIn: 'root' })
export class ContactService {
  private readonly endpoint = '/contact';

  constructor(private readonly api: BackendApiService) {}

  sendContact(payload: ContactDto): Observable<ContactMessageDto> {
    return this.api.post<ContactMessageDto>(this.endpoint, payload);
  }

  getMessages(): Observable<ContactMessageDto[]> {
    return this.api.get<ContactMessageDto[]>(this.endpoint);
  }

  getMessageById(id: string): Observable<ContactMessageDto> {
    return this.api.get<ContactMessageDto>(`${this.endpoint}/${id}`);
  }

  markAsRead(id: string): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${id}/read`, {});
  }

  deleteMessage(id: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${id}`);
  }
}
