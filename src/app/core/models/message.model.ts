// =============================================================
// src/app/core/models/message.model.ts
//
// يطابق PropertyApi.Application.Users.Messaging.DTOs.MessageDto تماماً.
// المراسلة في الـ Backend مرتبطة دائماً بعقار محدد (PropertyId إلزامي) —
// لا يوجد endpoint لصندوق وارد عام يجمع كل المحادثات عبر كل العقارات دفعة
// واحدة. لهذا فإن أي شاشة "رسائلي" في الواجهة يجب أن تُبنى فوق محادثة
// خاصة بعقار واحد، وليس فوق قائمة محادثات عامة غير مدعومة من الخادم.
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

export const MESSAGE_CONTENT_MAX_LENGTH = 3000;

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

/**
 * تجميع رسائل عقار واحد (المُعادة كلها للمالك من الخادم دفعة واحدة)
 * في محادثات منفصلة حسب الطرف الآخر — لأن الـ Backend لا يفعل هذا التجميع
 * نيابة عنا، بل يعيد كل الرسائل الخاصة بالعقار مسطّحة.
 */
export interface ConversationGroup {
  otherUserId: string;
  otherUserDisplayName: string;
  lastMessage: MessageDto;
  unreadCount: number;
  messages: MessageDto[];
}

export function groupMessagesByCounterpart(
  messages: MessageDto[],
  currentUserId: string | null
): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();

  for (const message of messages) {
    const otherUserId =
      message.senderId === currentUserId ? message.receiverId : message.senderId;

    const existing = groups.get(otherUserId);

    if (existing) {
      existing.messages.push(message);
      if (!message.isRead && message.receiverId === currentUserId) {
        existing.unreadCount += 1;
      }
      if (new Date(message.createdAt) > new Date(existing.lastMessage.createdAt)) {
        existing.lastMessage = message;
      }
    } else {
      groups.set(otherUserId, {
        otherUserId,
        otherUserDisplayName:
          message.senderId === otherUserId ? message.senderDisplayName : 'أنت',
        lastMessage: message,
        unreadCount: !message.isRead && message.receiverId === currentUserId ? 1 : 0,
        messages: [message]
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime()
  );
}
