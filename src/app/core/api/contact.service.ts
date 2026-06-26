import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';

export interface ContactDto {
  Name?: string;
  Email?: string;
  Subject?: string;
  Message?: string;
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
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
    return this.api.post<ContactMessageDto>(this.endpoint, this.toBackendContactRequest(payload));
  }

  getMessages(): Observable<ContactMessageDto[]> {
    return this.api
      .get<ContactMessageDto[] | ApiPagedResult<ContactMessageDto>>(this.endpoint)
      .pipe(map(response => unwrapItems(response)));
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

  private toBackendContactRequest(payload: ContactDto): Record<string, string> {
    return {
      name: String(payload.name ?? payload.Name ?? '').trim(),
      email: String(payload.email ?? payload.Email ?? '').trim(),
      subject: String(payload.subject ?? payload.Subject ?? '').trim(),
      message: String(payload.message ?? payload.Message ?? '').trim()
    };
  }
}

