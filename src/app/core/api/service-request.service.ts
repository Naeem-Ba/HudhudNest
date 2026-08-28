// src/app/core/api/service-request.service.ts
//
// AqarTech Services Marketplace — the requester-facing lifecycle.
// Endpoints:
//   POST   /api/ServiceRequests                    ← إنشاء طلب خدمة جديد
//   GET    /api/ServiceRequests/mine?status=...     ← طلباتي
//   GET    /api/ServiceRequests/{id}                ← تفاصيل طلب
//   GET    /api/ServiceRequests/{id}/history         ← سجل تغيّر الحالة
//   PUT    /api/ServiceRequests/{id}/cancel          ← إلغاء طلب
//   POST   /api/ServiceRequests/{id}/review          ← تقييم خدمة مكتملة

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import {
  AddServiceReviewPayload,
  CreateServiceRequestPayload,
  ServiceRequestDto,
  ServiceRequestStatus,
  ServiceRequestStatusHistoryDto,
  ServiceReviewDto
} from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class ServiceRequestService {
  private readonly endpoint = '/ServiceRequests';

  constructor(private readonly api: BackendApiService) {}

  getMine(status?: ServiceRequestStatus): Observable<ServiceRequestDto[]> {
    const query: Record<string, string | undefined> = {};
    if (status) query['status'] = status;

    return this.api
      .get<ServiceRequestDto[] | ApiPagedResult<ServiceRequestDto>>(`${this.endpoint}/mine`, query)
      .pipe(map(response => unwrapItems(response).map(item => this.toRequest(item))));
  }

  getById(id: string): Observable<ServiceRequestDto> {
    return this.api.get<unknown>(`${this.endpoint}/${id}`).pipe(map(response => this.toRequest(response)));
  }

  getHistory(id: string): Observable<ServiceRequestStatusHistoryDto[]> {
    return this.api
      .get<ServiceRequestStatusHistoryDto[] | ApiPagedResult<ServiceRequestStatusHistoryDto>>(
        `${this.endpoint}/${id}/history`
      )
      .pipe(map(response => unwrapItems(response)));
  }

  create(payload: CreateServiceRequestPayload): Observable<ServiceRequestDto> {
    const body = {
      PropertyId: payload.propertyId,
      ServiceOfferingId: payload.serviceOfferingId,
      RequesterNote: payload.requesterNote ?? null
    };

    return this.api.post<unknown>(this.endpoint, body).pipe(map(response => this.toRequest(response)));
  }

  cancel(id: string, reason?: string | null): Observable<ServiceRequestDto> {
    return this.api
      .put<unknown>(`${this.endpoint}/${id}/cancel`, { Reason: reason ?? null })
      .pipe(map(response => this.toRequest(response)));
  }

  addReview(id: string, payload: AddServiceReviewPayload): Observable<ServiceReviewDto> {
    const body = { Rating: payload.rating, Comment: payload.comment ?? null };
    return this.api.post<unknown>(`${this.endpoint}/${id}/review`, body).pipe(map(response => this.toReview(response)));
  }

  private toRequest(raw: unknown): ServiceRequestDto {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r['id'] ?? ''),
      requestNumber: String(r['requestNumber'] ?? ''),
      propertyId: String(r['propertyId'] ?? ''),
      propertyTitle: String(r['propertyTitle'] ?? ''),
      propertyMainImageUrl: r['propertyMainImageUrl'] as string | null | undefined,
      requesterId: String(r['requesterId'] ?? ''),
      requesterName: String(r['requesterName'] ?? ''),
      serviceProviderId: String(r['serviceProviderId'] ?? ''),
      serviceProviderDisplayName: String(r['serviceProviderDisplayName'] ?? ''),
      serviceOfferingId: String(r['serviceOfferingId'] ?? ''),
      serviceOfferingTitle: String(r['serviceOfferingTitle'] ?? ''),
      category: r['category'] as ServiceRequestDto['category'],
      status: (r['status'] as ServiceRequestStatus) ?? 'Submitted',
      requesterNote: r['requesterNote'] as string | null | undefined,
      providerNote: r['providerNote'] as string | null | undefined,
      scheduledAt: r['scheduledAt'] as string | null | undefined,
      quotedPrice: r['quotedPrice'] as number | null | undefined,
      quotedPriceCurrencyId: r['quotedPriceCurrencyId'] as number | null | undefined,
      finalPrice: r['finalPrice'] as number | null | undefined,
      finalPriceCurrencyId: r['finalPriceCurrencyId'] as number | null | undefined,
      rejectionReason: r['rejectionReason'] as string | null | undefined,
      cancellationReason: r['cancellationReason'] as string | null | undefined,
      completedAt: r['completedAt'] as string | null | undefined,
      createdAt: String(r['createdAt'] ?? '')
    };
  }

  private toReview(raw: unknown): ServiceReviewDto {
    const v = raw as Record<string, unknown>;
    return {
      id: String(v['id'] ?? ''),
      serviceRequestId: String(v['serviceRequestId'] ?? ''),
      serviceProviderId: String(v['serviceProviderId'] ?? ''),
      reviewerId: String(v['reviewerId'] ?? ''),
      reviewerName: String(v['reviewerName'] ?? ''),
      rating: Number(v['rating'] ?? 0),
      comment: v['comment'] as string | null | undefined,
      createdAt: String(v['createdAt'] ?? '')
    };
  }
}
