// =============================================================
// src/app/core/api/messages-api.service.ts
//
// يغلّف MessagesController (api/Messages):
//   GET  /api/Messages?propertyId=...&otherUserId=...&page=&pageSize=   (محادثة واحدة)
//   GET  /api/Messages/conversations?propertyId=&page=&pageSize=        (صندوق الوارد)
//   POST /api/Messages                    { propertyId, receiverId, content }
//   POST /api/Messages/conversations/read { propertyId, otherUserId }
//
// هوية المستخدم تُؤخذ دائمًا من التوكن في الخادم — لا يُرسَل أي senderId من هنا.
// =============================================================

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, normalizePagedResult, PagedResult } from '../models/api.model';
import {
  ConversationSummaryDto,
  MESSAGES_MAX_PAGE_SIZE,
  MessageDto,
  SendMessageRequest
} from '../models/message.model';

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
    pageSize = MESSAGES_MAX_PAGE_SIZE
  ): Observable<PagedResult<MessageDto>> {
    // الخادم يرفض pageSize > 50 (GetMessagesQueryValidator) — كان يُطلب 200 فتفشل الصفحة دائمًا.
    const safePageSize = Math.min(Math.max(pageSize, 1), MESSAGES_MAX_PAGE_SIZE);
    const query: Record<string, string | number> = { propertyId, page, pageSize: safePageSize };
    if (otherUserId) {
      query['otherUserId'] = otherUserId;
    }

    return this.api
      .get<MessageDto[] | ApiPagedResult<MessageDto>>('/Messages', query)
      .pipe(map(response => normalizePagedResult(response, item => this.toMessage(item), page, safePageSize)));
  }

  /** صندوق وارد المستخدم الحالي عبر كل العقارات (أو عقار واحد إن مُرِّر propertyId). */
  getConversations(
    propertyId?: string | null,
    page = 1,
    pageSize = 20
  ): Observable<PagedResult<ConversationSummaryDto>> {
    const safePageSize = Math.min(Math.max(pageSize, 1), MESSAGES_MAX_PAGE_SIZE);
    const query: Record<string, string | number> = { page, pageSize: safePageSize };
    if (propertyId) {
      query['propertyId'] = propertyId;
    }

    return this.api
      .get<ConversationSummaryDto[] | ApiPagedResult<ConversationSummaryDto>>('/Messages/conversations', query)
      .pipe(map(response => normalizePagedResult(response, item => this.toConversation(item), page, safePageSize)));
  }

  /** يعلّم رسائل المحادثة الواردة إلى المستخدم الحالي كمقروءة. */
  markConversationRead(propertyId: string, otherUserId: string): Observable<number> {
    return this.api
      .post<{ updated?: number }>('/Messages/conversations/read', {
        PropertyId: propertyId,
        OtherUserId: otherUserId
      })
      .pipe(map(response => Number(response?.updated ?? 0)));
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

  private toConversation(item: unknown): ConversationSummaryDto {
    const c = (item as Record<string, unknown>);

    return {
      propertyId: String(c['propertyId'] ?? ''),
      propertyTitle: String(c['propertyTitle'] ?? ''),
      propertyImageUrl: (c['propertyImageUrl'] as string) ?? null,
      isPropertyOwner: Boolean(c['isPropertyOwner']),
      otherUserId: String(c['otherUserId'] ?? ''),
      otherUserDisplayName: String(c['otherUserDisplayName'] ?? ''),
      otherUserImageUrl: (c['otherUserImageUrl'] as string) ?? null,
      lastMessageSenderId: String(c['lastMessageSenderId'] ?? ''),
      lastMessageContent: String(c['lastMessageContent'] ?? ''),
      lastMessageAt: String(c['lastMessageAt'] ?? ''),
      unreadCount: Number(c['unreadCount'] ?? 0)
    };
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
