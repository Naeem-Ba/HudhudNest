// =====================================================================
// ✅ Unit Tests – admin-subscription-date.util.spec.ts
// تغطية: قاعدة حساب تاريخ الانتهاء الجديد عند "تمديد" خطة/اشتراك من لوحة الإدارة —
// يجب أن تطابق UserAccount.ExtendPlan على الخادم تماماً (المعاينة قبل التأكيد لا يجوز
// أن تنحرف عن الحساب الفعلي).
// =====================================================================
import { addDays, computeExtendedExpiry, resolveExtensionBaseDate } from './admin-subscription-date.util';

describe('computeExtendedExpiry — نفس قاعدة UserAccount.ExtendPlan', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('✅ خطة نشطة وتاريخ الانتهاء في المستقبل: تُضاف مدة التمديد فوق التاريخ الحالي', () => {
    const currentExpiry = new Date('2026-09-10T12:00:00Z');

    const result = computeExtendedExpiry('Active', currentExpiry, 30, now);

    expect(result.toISOString()).toBe(addDays(currentExpiry, 30).toISOString());
  });

  it('✅ خطة منتهية (Expired): تبدأ المدة الجديدة من "الآن" لا من تاريخ الانتهاء القديم', () => {
    const pastExpiry = new Date('2026-08-20T12:00:00Z');

    const result = computeExtendedExpiry('Expired', pastExpiry, 30, now);

    expect(result.toISOString()).toBe(addDays(now, 30).toISOString());
  });

  it('✅ خطة ملغاة (Cancelled): تبدأ المدة الجديدة من "الآن" أيضاً', () => {
    const oldExpiry = new Date('2026-09-15T12:00:00Z'); // still in the future, but cancelled

    const result = computeExtendedExpiry('Cancelled', oldExpiry, 15, now);

    expect(result.toISOString()).toBe(addDays(now, 15).toISOString());
  });

  it('✅ لا توجد خطة (NoPlan) أو بلا تاريخ انتهاء مسجَّل: تبدأ من "الآن"', () => {
    expect(computeExtendedExpiry('NoPlan', null, 30, now).toISOString())
      .toBe(addDays(now, 30).toISOString());

    expect(computeExtendedExpiry('Active', null, 30, now).toISOString())
      .toBe(addDays(now, 30).toISOString());
  });

  it('✅ يقبل تاريخاً كنص (ISO) تماماً كما يقبل كائن Date', () => {
    const result = computeExtendedExpiry('Active', '2026-09-10T12:00:00Z', 30, now);
    expect(result.toISOString()).toBe(addDays(new Date('2026-09-10T12:00:00Z'), 30).toISOString());
  });
});

describe('resolveExtensionBaseDate', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('✅ خطة نشطة انتهت بالفعل (edge case): تُعامَل كأنها منتهية، تبدأ من "الآن"', () => {
    const justExpired = new Date('2026-09-01T11:59:59Z');
    expect(resolveExtensionBaseDate('Active', justExpired, now).getTime()).toBe(now.getTime());
  });
});
