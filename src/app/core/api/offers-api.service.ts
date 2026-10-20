// ─────────────────────────────────────────────────────────
// offers-api.service.ts
// GET /api/offers/active — عام، بدون مصادقة. 204 يعني "لا يوجد عرض حاليًا"،
// وهو ليس خطأً. الفرق بين الحالات الثلاث مهم للصفحة:
//   ready — عرض حقيقي: يُعرض.
//   empty — لا عرض منشور: حالة فارغة مفهومة (لا نخلطها بالخطأ).
//   error — فشل شبكة/خادم/استجابة غير متوقعة: رسالة خطأ مع إعادة محاولة.
// في كل الحالات لا يُرمى خطأ إلى الصفحة: فشل عرض تسويقي اختياري يجب ألا
// يكسر باقي صفحة الهبوط أبدًا. SKIP_ERROR_TOAST لأن الصفحة تعرض حالتها بنفسها.
// ─────────────────────────────────────────────────────────
import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { Offer } from '../models/offer.model';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';

export type ActiveOfferState =
  | { readonly status: 'ready'; readonly offer: Offer }
  | { readonly status: 'empty' }
  | { readonly status: 'error' };

/** استجابة 200 لا تحمل حدّ العرض الأدنى (id + name + نوع الخصم) تُعامل كخطأ لا كعرض. */
export function isUsableOffer(value: unknown): value is Offer {
  if (!value || typeof value !== 'object') return false;
  const o = value as Partial<Offer>;
  return typeof o.id === 'string' && o.id.length > 0
    && typeof o.name === 'string' && o.name.trim().length > 0
    && typeof o.discountType === 'string'
    && typeof o.discountValue === 'number';
}

@Injectable({ providedIn: 'root' })
export class OffersApiService {
  private readonly api = inject(BackendApiService);

  getActiveOfferState(): Observable<ActiveOfferState> {
    return this.api
      .get<Offer | null>('/offers/active', undefined, { context: new HttpContext().set(SKIP_ERROR_TOAST, true) })
      .pipe(
        map((body): ActiveOfferState => {
          if (body === null || body === undefined || (body as unknown) === '') {
            return { status: 'empty' };
          }
          return isUsableOffer(body) ? { status: 'ready', offer: body } : { status: 'error' };
        }),
        catchError(() => of<ActiveOfferState>({ status: 'error' })),
      );
  }
}
