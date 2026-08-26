// =============================================================
// src/app/core/api/messages-api.service.ts
//
// يغلّف MessagesController (api/Messages):
//   GET  /api/Messages?propertyId=...&otherUserId=...&page=&pageSize=
//   POST /api/Messages   { propertyId, receiverId, content }
//
// ملاحظة مهمة (موثّقة أيضاً في message.model.ts):
// الـ Backend لا يوفر endpoint لصندوق وارد عام يجمع كل محادثات المستخدم
// عبر كل العقارات. كل استدعاء GET يجب أن يمرّر propertyId. لذلك هذا الملف
// لا يخترع دالة "getInbox()" لأنها ستوهم بوجود شيء غير موجود في الخادم.
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult } from '../models/api.model';
import { MessageDto, SendMessageRequest } from '../models/message.model';

@Injectable({ providedIn: 'root' })
export class MessagesApiService {
  constructor(private readonly api: BackendApiService) {}

  /**
   * إذا مرّرت otherUserId: تُعاد محادثة واحدة بين المستخدم الحالي وهذا الطرف.
   * إن لم تُمرّرها: يُسمح فقط لمالك العقار برؤية كل رسائل عقاره (كل الزوار مجتمعين).
   */
  getPropertyMessages(
    propertyId: string,
    otherUserId?: string | null,
    page = 1,
    pageSize = 50
  ): Observable<PagedResult<MessageDto>> {
    const query: Record<string, string | number> = { propertyId, page, pageSize };
    if (otherUserId) {
      query['otherUserId'] = otherUserId;
    }

    return this.api
      .get<MessageDto[] | ApiPagedResult<MessageDto>>('/Messages', query)
      .pipe(map(response => normalizePagedResult(response, item => this.toMessage(item), page, pageSize)));
  }

  sendMessage(request: SendMessageRequest): Observable<MessageDto> {
    // ✅ الـ Backend يتوقع PascalCase في الـ body (نفس نمط visit.service.ts)
    const body = {
      PropertyId: request.propertyId,
      ReceiverId: request.receiverId ?? null,
      Content: request.content.trim()
    };

    return this.api.post<unknown>('/Messages', body).pipe(map(item => this.toMessage(item)));
  }

  private toMessage(item: unknown): MessageDto {
    const message = (item as Record<string, unknown>);

    return {
      id: String(message['id'] ?? ''),
      propertyId: String(message['propertyId'] ?? ''),
      senderId: String(message['senderId'] ?? ''),
      receiverId: String(message['receiverId'] ?? ''),
      senderDisplayName: String(message['senderDisplayName'] ?? ''),
      content: String(message['content'] ?? ''),
      isRead: Boolean(message['isRead']),
      readAt: (message['readAt'] as string) ?? null,
      createdAt: String(message['createdAt'] ?? '')
    };
  }
}
