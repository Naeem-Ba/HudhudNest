import { Injectable } from '@angular/core';

/**
 * ScrollLockService — يمنع تمرير الصفحة الخلفية أثناء فتح أي طبقة علوية
 * (Mobile Drawer, Modal, …) بدون قفل الـ scroll بشكل دائم عن طريق الخطأ.
 *
 * لماذا خدمة مركزية بدل `document.body.style.overflow = 'hidden'` داخل كل
 * مكوّن على حدة: لو فتح أكثر من overlay بنفس الوقت (مثلاً Drawer فوقه Modal)
 * وأغلق أحدهما فقط، أي كومبوننت يكتب/يمسح `overflow` مباشرة سيُلغي القفل
 * الذي ما زال العنصر الآخر يحتاجه. الـ ref-count هنا يضمن أن القفل لا يُرفع
 * إلا بعد إغلاق آخر عنصر طلبه.
 *
 * لماذا `position: fixed` على body وليس `overflow: hidden` وحده: في iOS
 * Safari/WKWebView (Capacitor) لا يمنع `overflow: hidden` على body التمرير
 * اللمسي الفعلي خلف عنصر position:fixed — الصفحة "تتسرّب" وتتحرك خلف
 * الـ Drawer رغم القفل. تثبيت body بـ position:fixed مع حفظ/استعادة موضع
 * التمرير هو الحل المعروف والموثّق لهذا القيد تحديدًا على WebKit.
 */
@Injectable({ providedIn: 'root' })
export class ScrollLockService {
  private lockCount = 0;
  private savedScrollY = 0;

  lock(): void {
    this.lockCount += 1;

    if (this.lockCount !== 1) {
      return;
    }

    this.savedScrollY = window.scrollY || window.pageYOffset || 0;

    const html = document.documentElement;
    const body = document.body;

    html.classList.add('scroll-locked');
    body.style.top = `-${this.savedScrollY}px`;
  }

  unlock(): void {
    if (this.lockCount === 0) {
      return;
    }

    this.lockCount -= 1;

    if (this.lockCount !== 0) {
      return;
    }

    const html = document.documentElement;
    const body = document.body;

    html.classList.remove('scroll-locked');
    body.style.top = '';

    window.scrollTo(0, this.savedScrollY);
  }

  /** لطبقات تُغلق برمجيًا (route change, destroy) وتحتاج التأكد أن قفلها رُفع فعلاً بدل تخمين حالته. */
  forceUnlockIfHeldBy(wasLocked: boolean): void {
    if (wasLocked) {
      this.unlock();
    }
  }
}
