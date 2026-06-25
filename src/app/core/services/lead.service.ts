import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';
import { LeadPayload, LeadResponse } from '../models/lead.model';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LeadService {
  private readonly http = inject(HttpClient);

  // Backend الحالي عندك يحتوي /api/Contact وليس /api/leads
  private readonly apiUrl = `${environment.apiBaseUrl}/api/Contact`;

  private readonly timeoutMs = 12_000;

  submitLead(payload: Omit<LeadPayload, 'source'>): Observable<LeadResponse> {
    const cleanPhone = payload.phoneOrWhatsapp.trim();
    const cleanName = payload.fullName.trim();
    const cleanCity = payload.city.trim();

    const contactBody = {
      name: cleanName,

      // Contact endpoint يحتاج Email. الصفحة لا تجمع email،
      // لذلك نستخدم بريدًا ثابتًا صالحًا للـ validation.
      email: 'landing-lead@bizorealestateworld.com',

      subject: `Lead من صفحة الهبوط - ${payload.userType}`,

      message:
        `نوع المستخدم: ${payload.userType}\n` +
        `المدينة: ${cleanCity}\n` +
        `الهاتف/واتساب: ${cleanPhone}\n` +
        `المصدر: landing-page\n` +
        `ملاحظات: ${payload.notes?.trim() || 'لا توجد'}`
    };

    return this.http
      .post<{ success: boolean; id: string }>(this.apiUrl, contactBody)
      .pipe(
        timeout(this.timeoutMs),
        map(res => ({
          success: true,
          message: 'تم التسجيل بنجاح',
          leadId: res.id
        })),
        catchError((err: HttpErrorResponse | unknown) =>
          throwError(() => this.parseError(err))
        )
      );
  }

  private parseError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.';
      }

      if (err.status === 400 || err.status === 422) {
        return 'بعض البيانات المُدخلة غير صحيحة. راجع الحقول وأعد المحاولة.';
      }

      if (err.status === 429) {
        return 'لقد أرسلت طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.';
      }

      if (err.status >= 500) {
        return 'حدث خطأ في الخادم. سنعمل على إصلاحه قريبًا.';
      }
    }

    return 'حدث خطأ غير متوقع. يرجى المحاولة مجددًا.';
  }
}