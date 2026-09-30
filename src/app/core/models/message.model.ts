// =============================================================
// src/app/core/models/message.model.ts
//
// يطابق HudhudNestApi.Application.Users.Messaging.DTOs.MessageDto و
// ConversationSummaryDto. كل رسالة مرتبطة بعقار محدد؛ "المحادثة" = كل الرسائل
// بين المستخدم الحالي وطرف واحد آخر بخصوص عقار واحد. صندوق الوارد
// (GET /api/Messages/conversations) يجمعها في الخادم عبر كل العقارات.
// =============================================================

export interface MessageDto {
  id: string;
  propertyId: string;
  senderId: string;
  receiverId: string;
  senderDisplayName: string;
  content: string;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface SendMessageRequest {
  propertyId: string;
  receiverId?: string | null;
  content: string;
}

/** صف واحد في صندوق الوارد — راجع ConversationSummaryDto في الباك اند. */
export interface ConversationSummaryDto {
  propertyId: string;
  propertyTitle: string;
  propertyImageUrl: string | null;
  /** true إن كان المستخدم الحالي مالك العقار (أي أن هذا استفسار وارد عليه). */
  isPropertyOwner: boolean;
  otherUserId: string;
  otherUserDisplayName: string;
  otherUserImageUrl: string | null;
  lastMessageSenderId: string;
  lastMessageContent: string;
  lastMessageAt: string;
  unreadCount: number;
}

export const MESSAGE_CONTENT_MAX_LENGTH = 3000;

/** الحد الأقصى لـ pageSize الذي يقبله الخادم (GetMessagesQueryValidator). */
export const MESSAGES_MAX_PAGE_SIZE = 50;

/** الرسائل بترتيب زمني تصاعدي (الأقدم أولًا) — الخادم يعيدها من الأحدث. */
export function sortChronologically(messages: MessageDto[]): MessageDto[] {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function validateMessageContent(content: string): string | null {
  const trimmed = (content ?? '').trim();

  if (!trimmed) {
    return 'MESSAGES.ERROR_EMPTY';
  }

  if (trimmed.length > MESSAGE_CONTENT_MAX_LENGTH) {
    return 'MESSAGES.ERROR_TOO_LONG';
  }

  return null;
}
