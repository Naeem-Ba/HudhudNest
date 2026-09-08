// ─────────────────────────────────────────────────────────
// offers-api.service.ts
// GET /api/offers/active — عام، بدون مصادقة. 204 يعني "لا يوجد عرض حاليًا"،
// وليس خطأً؛ الصفحة يجب أن تُخفي قسم العرض بالكامل في هذه الحالة بدل إظهار
// شيء منتهٍ أو فارغ. أي خطأ شبكة آخر يُعامَل بنفس الطريقة (يُخفى القسم) —
// فشل تحميل عرض تسويقي اختياري يجب ألا يكسر باقي صفحة الهبوط أبدًا.
// ─────────────────────────────────────────────────────────
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { Offer } from '../models/offer.model';

@Injectable({ providedIn: 'root' })
export class OffersApiService {
  private readonly api = inject(BackendApiService);

  getActiveOffer(): Observable<Offer | null> {
    return this.api.get<Offer | null>('/offers/active').pipe(
      catchError(() => of(null))
    );
  }
}
