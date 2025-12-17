import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError, shareReplay } from 'rxjs/operators';

export interface EnumItem {
  id: number;
  key: string;
}


@Injectable({ providedIn: 'root' })
export class EnumService {
  private baseUrl = 'https://localhost:7136/api/Enum';

  // 1. إعادة الكاش تخزين البيانات الفعلية
  private cache: Record<string, EnumItem[]> = {};

  // تخزين طلبات الـ Observable لمنع تكرار الطلب للسيرفر في نفس الوقت
  private observables: Record<string, Observable<EnumItem[]>> = {};

  constructor(private http: HttpClient) {}

  // 2.  تعديل دالة getEnum لدعم التخزين المؤقت
  //    هذه الدالة تستخدم لتحميل القائمة من الـ API وتخزينها
  getEnum(group: string): Observable<EnumItem[]> {
    const groupKey = group.toLowerCase();

    // التحقق من الكاش أولاً إذا كانت البيانات موجودة في الكاش، أعدها فوراً
    if (this.cache[groupKey]) {
      return of(this.cache[groupKey]);
    }

    this.observables[groupKey] = this.http.get<EnumItem[]>(`${this.baseUrl}/${group}`).pipe(
      tap(list => {
        this.cache[groupKey] = list; // حفظ في الكاش
        delete this.observables[groupKey]; // مسح من قائمة الطلبات النشطة
      }),
      shareReplay(1),
      catchError(() => {
        delete this.observables[groupKey];
        return of([]);
      })
    );

    return this.observables[groupKey];
  }

  /** 3.  إضافة دالة getKey لاستخدامها داخل الـ Pipe بشكل متزامن */
  //    هذه الدالة تبحث في الكاش عن المفتاح النصي (Key)
  getKey(group: string, id: number): string | null {
    const list = this.cache[group.toLowerCase()];
    const found = list?.find(e => e.id === id);
    // إذا وُجد، أعد المفتاح (Key)، وإلا أعد الـ ID كرقم نصي
    return found ? found.key : null;
  }
}
