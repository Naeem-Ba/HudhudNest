// ─────────────────────────────────────────────────────────
// lead.model.ts
// نموذج بيانات المهتمين (Leads) لمنصة PropertyApp
//
// يطابق LeadSubmitDto/SubmitLeadResultDto الحقيقيين على الباك-إند
// (PropertyApi.Application/Marketing/DTOs) — انظر LeadsController.
// القيم المسموحة لـ UserType مطابقة حرفيًا لـ Lead.AllowedUserTypes هناك.
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
  /** رمز عرض "أول 100 مكتب" الحالي، إن وُجد — من GET /api/offers/active. */
  offerId?:         string;
  campaign?:        string;
}

export interface LeadResponse {
  success:  boolean;
  message:  string;
  leadId?:  string;
  /** true فقط إذا أُرسل offerId ونجح فعليًا حجز مقعد فيه — انظر
   *  SubmitLeadResultDto.OfferApplied على الباك-إند: طلب العرض لا يُسقط التسجيل
   *  أبدًا حتى لو اكتمل العرض أو انتهى، فقط لا يُربط به. */
  offerRequested?: boolean;
  offerApplied?:   boolean;
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

// ─────────────────────────────────────────────────────────
// نسخ قابلة للترجمة (i18n) من نفس القيم أعلاه — تُستخدَم حصرًا في
// صفحة الهبوط (landing-page). القيمة المُرسَلة للباك-إند (value) تبقى
// النص العربي الثابت نفسه في كل اللغات (يطابق ما تتوقعه لوحة التحكم
// وAllowedUserTypes/بيانات المدن الحالية) — فقط تسمية العرض تُترجَم عبر
// labelKey في public/i18n/{ar,de,en}.json تحت LANDING.FORM.
// ─────────────────────────────────────────────────────────
export interface LabeledOption<T extends string = string> {
  value:    T;
  labelKey: string;
}

export const USER_TYPE_OPTIONS: LabeledOption<UserType>[] = [
  { value: 'renter',   labelKey: 'LANDING.FORM.USER_TYPES.RENTER' },
  { value: 'buyer',    labelKey: 'LANDING.FORM.USER_TYPES.BUYER' },
  { value: 'owner',    labelKey: 'LANDING.FORM.USER_TYPES.OWNER' },
  { value: 'agency',   labelKey: 'LANDING.FORM.USER_TYPES.AGENCY' },
  { value: 'investor', labelKey: 'LANDING.FORM.USER_TYPES.INVESTOR' },
];

export const SYRIA_CITY_OPTIONS: LabeledOption[] = [
  { value: 'دمشق',        labelKey: 'LANDING.FORM.CITIES.DAMASCUS' },
  { value: 'حلب',         labelKey: 'LANDING.FORM.CITIES.ALEPPO' },
  { value: 'حمص',         labelKey: 'LANDING.FORM.CITIES.HOMS' },
  { value: 'حماة',        labelKey: 'LANDING.FORM.CITIES.HAMA' },
  { value: 'اللاذقية',    labelKey: 'LANDING.FORM.CITIES.LATAKIA' },
  { value: 'طرطوس',       labelKey: 'LANDING.FORM.CITIES.TARTUS' },
  { value: 'السويداء',    labelKey: 'LANDING.FORM.CITIES.SWEIDA' },
  { value: 'درعا',        labelKey: 'LANDING.FORM.CITIES.DARAA' },
  { value: 'القنيطرة',    labelKey: 'LANDING.FORM.CITIES.QUNEITRA' },
  { value: 'دير الزور',   labelKey: 'LANDING.FORM.CITIES.DEIR_EZZOR' },
  { value: 'الرقة',       labelKey: 'LANDING.FORM.CITIES.RAQQA' },
  { value: 'الحسكة',      labelKey: 'LANDING.FORM.CITIES.HASAKA' },
  { value: 'إدلب',        labelKey: 'LANDING.FORM.CITIES.IDLIB' },
  { value: 'ريف دمشق',    labelKey: 'LANDING.FORM.CITIES.DAMASCUS_COUNTRYSIDE' },
  { value: 'منطقة أخرى',  labelKey: 'LANDING.FORM.CITIES.OTHER' },
];
