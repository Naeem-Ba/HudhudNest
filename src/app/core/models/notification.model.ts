// src/app/core/models/notification.model.ts
//
// ❌ المشكلة: النموذج القديم كان يحتوي على حقول غير موجودة في الـ API:
//    - title  → لا يوجد في NotificationDto
//    - body   → لا يوجد في NotificationDto
//
// وكان يفتقد حقولاً أساسية:
//    - message          → النص الفعلي للإشعار
//    - propertyId       → لربط الإشعار بعقار
//    - relatedEntityId  → للروابط الداخلية
//    - readAt           → وقت القراءة
//
// ✅ الإصلاح: مطابقة كاملة مع NotificationDto من الـ Backend (قسم 10.4 في المواصفات).
//
// ملاحظة: الحقول بـ PascalCase كـ Id, Type هي ما يرجعه الـ Backend حالياً.
// عند توحيد Backend على camelCase: غيّر الحقول لتصبح id, type, message...

export interface NotificationDto {
  // PascalCase — مطابق لما يرجعه الـ Backend حالياً (PropertyNamingPolicy = null)
  Id: string;
  Type: string;
  Message: string;
  PropertyId?: string | null;
  RelatedEntityId?: string | null;
  IsRead: boolean;
  ReadAt?: string | null;
  CreatedAt: string;
}

// ✅ نموذج camelCase للاستخدام الداخلي في Angular
// الباك اند يُرجع camelCase مباشرة الآن (RELEASE-BLOCKERS-AR.md B-11) — لا تحويل مطلوب
export interface NotificationItem {
  id: string;
  type?: string;
  message: string;           // ✅ الحقل الصحيح (كان "body" خطأً)
  propertyId?: string | null;
  relatedEntityId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt?: string;
}

// ✅ نموذج الإشعار الفوري من SignalR
// قد يكون بـ PascalCase أو camelCase — نقبل الاثنين
export interface RealtimeNotificationPayload {
  Id?: string;
  id?: string;
  Type?: string;
  type?: string;
  Message?: string;
  message?: string;
  PropertyId?: string | null;
  propertyId?: string | null;
  RelatedEntityId?: string | null;
  relatedEntityId?: string | null;
  IsRead?: boolean;
  isRead?: boolean;
  ReadAt?: string | null;
  readAt?: string | null;
  CreatedAt?: string;
  createdAt?: string;
}

// ✅ تحويل استجابة الـ Backend (PascalCase أو camelCase) إلى NotificationItem الداخلي
export function toNotificationItem(raw: unknown): NotificationItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(r['Id'] ?? r['id'] ?? ''),
    type: String(r['Type'] ?? r['type'] ?? ''),
    message: String(r['Message'] ?? r['message'] ?? ''),
    propertyId: (r['PropertyId'] ?? r['propertyId']) as string | null | undefined,
    relatedEntityId: (r['RelatedEntityId'] ?? r['relatedEntityId']) as string | null | undefined,
    isRead: Boolean(r['IsRead'] ?? r['isRead'] ?? false),
    readAt: (r['ReadAt'] ?? r['readAt']) as string | null | undefined,
    createdAt: String(r['CreatedAt'] ?? r['createdAt'] ?? '')
  };
}