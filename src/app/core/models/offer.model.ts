// ─────────────────────────────────────────────────────────
// offer.model.ts
// عرض تسويقي محدود (مثل "أول 100 مكتب عقاري") — يطابق OfferDto
// الحقيقي على الباك-إند (PropertyApi.Application/Marketing/DTOs/OfferDto.cs).
//
// لا بوابة دفع ولا اشتراك فعلي هنا — انظر FRONTEND_BACKEND_CONTRACT.md §11.5.
// هذا مجرد التزام تسويقي يُسجَّل مع العميل المحتمل (Lead)، ويُطبَّق يدويًا
// من فريق المبيعات عند التواصل، وليس عبر أي حساب أو فوترة تلقائية.
// ─────────────────────────────────────────────────────────

export type OfferDiscountType = 'Percentage' | 'FixedAmountUsd' | 'FreeMonths';

export interface Offer {
  id: string;
  name: string;
  description?: string | null;
  discountType: OfferDiscountType;
  discountValue: number;
  targetPlanTier?: string | null;
  /** null = لا تاريخ انتهاء ثابت (العرض مقيّد بالعدد فقط، إن وُجد حد). */
  endsAtUtc?: string | null;
  /** null = بلا حد أقصى للمستفيدين. */
  maxRedemptions?: number | null;
  redeemedCount: number;
  terms?: string | null;
}

/** نص عربي مختصر لقيمة الخصم، بحسب نوعه — لا يفترض عملة أو مدة غير موجودة فعليًا. */
export function formatOfferDiscount(offer: Offer): string {
  switch (offer.discountType) {
    case 'Percentage':
      return `خصم ${offer.discountValue}%`;
    case 'FixedAmountUsd':
      return `خصم ${offer.discountValue}$`;
    case 'FreeMonths':
      return `${offer.discountValue} ${offer.discountValue === 1 ? 'شهر مجاني' : 'أشهر مجانية'}`;
    default:
      return '';
  }
}

/** null إذا لم يكن للعرض حد أقصى حقيقي — لا نعرض عدّادًا مصطنعًا في هذه الحالة. */
export function remainingSlots(offer: Offer): number | null {
  if (offer.maxRedemptions == null) return null;
  return Math.max(0, offer.maxRedemptions - offer.redeemedCount);
}
