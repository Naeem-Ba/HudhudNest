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
/** Which screen a notification opens (computed by the API). The screen re-checks access itself. */
export interface NotificationTarget {
  kind: string;
  id?: string | null;
  propertyId?: string | null;
}

export type NotificationPriority = 'Low' | 'Normal' | 'High';

export interface NotificationItem {
  id: string;
  type?: string;
  /** Filter group: messages, listings, visits, services ... (absent on an older API). */
  category?: string;
  priority?: NotificationPriority;
  target?: NotificationTarget | null;
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
    category: ((r['Category'] ?? r['category']) as string | undefined) || undefined,
    priority: toPriority(r['Priority'] ?? r['priority']),
    target: toTarget(r['Target'] ?? r['target']),
    message: String(r['Message'] ?? r['message'] ?? ''),
    propertyId: (r['PropertyId'] ?? r['propertyId']) as string | null | undefined,
    relatedEntityId: (r['RelatedEntityId'] ?? r['relatedEntityId']) as string | null | undefined,
    isRead: Boolean(r['IsRead'] ?? r['isRead'] ?? false),
    readAt: (r['ReadAt'] ?? r['readAt']) as string | null | undefined,
    createdAt: String(r['CreatedAt'] ?? r['createdAt'] ?? '')
  };
}

function toPriority(value: unknown): NotificationPriority | undefined {
  if (value === 0 || value === 'Low') return 'Low';
  if (value === 1 || value === 'Normal') return 'Normal';
  if (value === 2 || value === 'High') return 'High';
  return undefined;
}

function toTarget(value: unknown): NotificationTarget | null {
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  const kind = String(t['Kind'] ?? t['kind'] ?? '');
  if (!kind) return null;
  return {
    kind,
    id: ((t['Id'] ?? t['id']) as string | null | undefined) ?? null,
    propertyId: ((t['PropertyId'] ?? t['propertyId']) as string | null | undefined) ?? null
  };
}
