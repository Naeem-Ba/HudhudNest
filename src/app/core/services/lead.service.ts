// ─────────────────────────────────────────────────────────
// lead.service.ts
//
// يرسل إلى POST /api/leads الحقيقي (LeadsController على الباك-إند) —
// وليس /api/Contact كما كان سابقًا. الحقن السابق كان يخزّن كل بيانات
// النموذج (المدينة/نوع المستخدم/الهاتف) كنص حر داخل ContactMessage.Body
// عبر بريد وهمي ثابت، فلم تكن هذه البيانات قابلة للفلترة أو التصدير أو
// الربط بعرض. الآن تُخزَّن كأعمدة حقيقية في جدول Leads.
// ─────────────────────────────────────────────────────────
import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError, timeout } from 'rxjs';
import { BackendApiService } from '../api/backend-api.service';
import { LeadPayload, LeadResponse } from '../models/lead.model';

interface SubmitLeadApiResponse {
  leadId: string;
  offerRequested: boolean;
  offerApplied: boolean;
}

@Injectable({ providedIn: 'root' })
export class LeadService {
  private readonly api = inject(BackendApiService);
  private readonly timeoutMs = 12_000;

  submitLead(payload: Omit<LeadPayload, 'source'>): Observable<LeadResponse> {
    const body = {
      fullName: payload.fullName.trim(),
      phone: payload.phoneOrWhatsapp.trim(),
      city: payload.city.trim(),
      userType: payload.userType,
      notes: payload.notes?.trim() || undefined,
      campaign: payload.campaign?.trim() || undefined,
      offerId: payload.offerId || undefined,
    };

    return this.api.post<SubmitLeadApiResponse>('/leads', body).pipe(
      timeout(this.timeoutMs),
      map(res => ({
        success: true,
        message: 'تم التسجيل بنجاح',
        leadId: res.leadId,
        offerRequested: res.offerRequested,
        offerApplied: res.offerApplied,
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
