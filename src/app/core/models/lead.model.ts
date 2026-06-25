// ─────────────────────────────────────────────────────────
// lead.model.ts
// نموذج بيانات المهتمين (Leads) لمنصة PropertyApp
// ─────────────────────────────────────────────────────────

export type UserType =
  | 'renter'      // باحث عن إيجار
  | 'buyer'       // باحث عن شراء
  | 'owner'       // صاحب عقار
  | 'agency'      // مكتب عقاري
  | 'investor';   // مستثمر / مغترب

export interface LeadPayload {
  fullName:         string;
  phoneOrWhatsapp:  string;
  userType:         UserType;
  city:             string;
  notes?:           string;
  source:           'landing-page';
}

export interface LeadResponse {
  success:  boolean;
  message:  string;
  leadId?:  string;
}

export const USER_TYPE_LABELS: Record<UserType, string> = {
  renter:   'أبحث عن عقار للإيجار',
  buyer:    'أبحث عن عقار للشراء',
  owner:    'أريد نشر عقاري',
  agency:   'مكتب عقاري',
  investor: 'مستثمر / مغترب',
};

export const SYRIA_CITIES = [
  'دمشق',
  'حلب',
  'حمص',
  'حماة',
  'اللاذقية',
  'طرطوس',
  'السويداء',
  'درعا',
  'القنيطرة',
  'دير الزور',
  'الرقة',
  'الحسكة',
  'إدلب',
  'ريف دمشق',
  'منطقة أخرى',
];
