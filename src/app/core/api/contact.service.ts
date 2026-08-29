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
      .pipe(map(response => unwrapItems(response).map(item => this.normalizeMessage(item))));
  }

  getMessageById(id: string): Observable<ContactMessageDto> {
    return this.api
      .get<ContactMessageDto>(`${this.endpoint}/${id}`)
      .pipe(map(item => this.normalizeMessage(item)));
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

  /**
   * ✅ إصلاح: الخادم يُسلسِل كل الحقول بصيغة camelCase (JsonNamingPolicy.CamelCase
   * في Program.cs)، وحقل نص الرسالة في ContactMessageDto اسمه الحقيقي "body" وليس
   * "message"، وتاريخ الإرسال اسمه "createdAt" وليس "sentAt". صفحتا القائمة
   * والتفاصيل (messages.component.html, message-details.component.html) تقرآن
   * حصراً msg.Name / msg.Email / msg.Subject / msg.Message / msg.SentAt بصيغة
   * PascalCase — فكانت تظهر فارغة دائماً: لا الاسم ولا العنوان ولا نص الرسالة نفسه
   * موجودون بهذا الاسم/الحالة في استجابة الخادم الفعلية. نطبّع هنا الشكل القادم من
   * الخادم إلى الحقلين معاً (PascalCase وcamelCase) بالأسماء الصحيحة، كي تعمل
   * القوالب الحالية دون تعديلها.
   */
  private normalizeMessage(raw: ContactMessageDto): ContactMessageDto {
    const source = (raw ?? {}) as Record<string, unknown>;

    const id = String(source['Id'] ?? source['id'] ?? '');
    const name = String(source['Name'] ?? source['name'] ?? '');
    const email = String(source['Email'] ?? source['email'] ?? '');
    const subject = String(source['Subject'] ?? source['subject'] ?? '');
    const message = String(
      source['Message'] ?? source['message'] ?? source['Body'] ?? source['body'] ?? ''
    );
    const isRead = Boolean(source['IsRead'] ?? source['isRead'] ?? false);
    const sentAt = String(
      source['SentAt'] ?? source['sentAt'] ?? source['CreatedAt'] ?? source['createdAt'] ?? ''
    );

    return {
      Id: id,
      id,
      Name: name,
      name,
      Email: email,
      email,
      Subject: subject,
      subject,
      Message: message,
      message,
      IsRead: isRead,
      isRead,
      CreatedAt: sentAt,
      createdAt: sentAt,
      SentAt: sentAt,
      sentAt
    };
  }
}

