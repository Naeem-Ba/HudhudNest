// src/app/core/services/visit.service.ts
//
// ✅ خدمة جديدة كاملة — مطابقة لمواصفات الـ API (قسم 9.9)
//
// Endpoints:
//   GET    /api/Visits/mine?status=Pending   ← زياراتي
//   GET    /api/Visits/property/{id}         ← زيارات عقار (للمالك)
//   POST   /api/Visits                       ← طلب زيارة جديدة
//   PUT    /api/Visits/{id}/confirm          ← قبول زيارة
//   PUT    /api/Visits/{id}/decline          ← رفض زيارة
//   DELETE /api/Visits/{id}                  ← إلغاء زيارة

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { apiToCamelCase } from '../adapters/api-naming.adapter';
import {
  CreateVisitRequest,
  VisitDto,
  VisitStatus
} from '../models/visit.model';

@Injectable({ providedIn: 'root' })
export class VisitService {
  private readonly endpoint = '/visits';

  constructor(private readonly api: BackendApiService) {}

  /**
   * زياراتي (كزائر أو كمالك).
   * @param status فلترة اختيارية حسب الحالة: Pending, Confirmed, Declined, Cancelled, Completed
   */
  getMyVisits(status?: VisitStatus): Observable<VisitDto[]> {
    const query: Record<string, string | undefined> = {};
    if (status) query['status'] = status;

    return this.api
      .get<VisitDto[] | ApiPagedResult<VisitDto>>(`${this.endpoint}/mine`, query)
      .pipe(map(response => unwrapItems(response).map(item => this.toVisit(item))));
  }

  /**
   * زيارات عقار محدد — للمالك فقط.
   */
  getPropertyVisits(propertyId: string): Observable<VisitDto[]> {
    return this.api
      .get<VisitDto[] | ApiPagedResult<VisitDto>>(`${this.endpoint}/property/${propertyId}`)
      .pipe(map(response => unwrapItems(response).map(item => this.toVisit(item))));
  }

  /**
   * طلب زيارة جديدة.
   * Backend يُرجع الـ VisitDto الجديد.
   *
   * القيود:
   *   - proposedAt يجب أن يكون بعد ساعتين على الأقل
   *   - proposedAt لا يتجاوز 90 يوماً مقدماً
   *   - visitorName مطلوب (max 150)
   *   - visitorPhone مطلوب (صيغة دولية)
   *   - visitorNote اختياري (max 500)
   *
   * تحقق من validateCreateVisit() في visit.model.ts قبل الاستدعاء.
   */
  requestVisit(request: CreateVisitRequest): Observable<VisitDto> {
    // ✅ الـ Backend يتوقع PascalCase في الـ body
    const body = {
      PropertyId: request.propertyId,
      ProposedAt: request.proposedAt,
      VisitorName: request.visitorName,
      VisitorPhone: request.visitorPhone,
      VisitorNote: request.visitorNote ?? null
    };

    return this.api
      .post<unknown>(this.endpoint, body)
      .pipe(map(response => this.toVisit(response)));
  }

  /**
   * قبول زيارة — للمالك فقط.
   */
  confirmVisit(visitId: string): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${visitId}/confirm`);
  }

  /**
   * رفض زيارة — للمالك فقط.
   */
  declineVisit(visitId: string): Observable<void> {
    return this.api.put<void>(`${this.endpoint}/${visitId}/decline`);
  }

  /**
   * إلغاء زيارة — للزائر (صاحب الطلب) فقط.
   */
  cancelVisit(visitId: string): Observable<void> {
    return this.api.delete<void>(`${this.endpoint}/${visitId}`);
  }

  private toVisit(raw: unknown): VisitDto {
    const v = apiToCamelCase<Record<string, unknown>>(raw);
    return {
      id: String(v['id'] ?? ''),
      propertyId: String(v['propertyId'] ?? ''),
      propertyTitle: v['propertyTitle'] as string | undefined,
      visitorId: v['visitorId'] as string | undefined,
      visitorName: String(v['visitorName'] ?? ''),
      visitorPhone: String(v['visitorPhone'] ?? ''),
      visitorNote: v['visitorNote'] as string | null | undefined,
      proposedAt: String(v['proposedAt'] ?? ''),
      status: (v['status'] as VisitStatus) ?? 'Pending',
      ownerId: v['ownerId'] as string | undefined,
      createdAt: v['createdAt'] as string | undefined,
      updatedAt: v['updatedAt'] as string | undefined
    };
  }
}