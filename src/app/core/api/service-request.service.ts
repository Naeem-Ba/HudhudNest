// src/app/core/api/service-request.service.ts
//
// HudhudNest Services Marketplace — requester-facing lifecycle AND the provider-facing
// lifecycle (added alongside the provider dashboard — see provider-inbox.page.ts /
// provider-request-detail.page.ts).
// Endpoints:
//   POST   /api/ServiceRequests                      ← إنشاء طلب خدمة جديد
//   GET    /api/ServiceRequests/mine?status=...       ← طلباتي (كطالب خدمة)
//   GET    /api/ServiceRequests/provider-inbox        ← الطلبات الواردة (كمزوّد خدمة)
//   GET    /api/ServiceRequests/{id}                  ← تفاصيل طلب
//   GET    /api/ServiceRequests/{id}/history           ← سجل تغيّر الحالة
//   GET    /api/ServiceRequests/{id}/documents          ← مستندات الطلب
//   POST   /api/ServiceRequests/{id}/documents          ← رفع مستند
//   PUT    /api/ServiceRequests/{id}/accept             ← قبول (مزوّد الخدمة)
//   PUT    /api/ServiceRequests/{id}/reject             ← رفض (مزوّد الخدمة)
//   PUT    /api/ServiceRequests/{id}/schedule           ← جدولة موعد (مزوّد الخدمة)
//   PUT    /api/ServiceRequests/{id}/start              ← بدء التنفيذ (مزوّد الخدمة)
//   PUT    /api/ServiceRequests/{id}/complete           ← إتمام الطلب (مزوّد الخدمة)
//   PUT    /api/ServiceRequests/{id}/not-completed      ← لم تُنجَز الخدمة + السبب (مزوّد الخدمة)
//   PUT    /api/ServiceRequests/{id}/feedback           ← ردّ العميل على النتيجة (يؤكد/يعترض) + سببه
//   PUT    /api/ServiceRequests/{id}/cancel             ← إلغاء طلب
//   GET    /api/ServiceRequests/{id}/messages           ← محادثة الطلب بين العميل والمزوّد
//   POST   /api/ServiceRequests/{id}/messages           ← رسالة جديدة
//   PUT    /api/ServiceRequests/{id}/messages/read      ← تعليم رسائل الطرف الآخر كمقروءة
//   PUT    /api/ServiceRequests/{id}/confirm            ← تأكيد العميل: يتحوّل الاستعلام إلى طلب
//   POST   /api/ServiceRequests/{id}/review             ← تقييم خدمة مكتملة

import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import {
  AcceptServiceRequestPayload,
  AddServiceReviewPayload,
  CompleteServiceRequestPayload,
  CreateServiceRequestPayload,
  NotCompletedServiceRequestPayload,
  ServiceOutcomeReason,
  ServiceRequestDocumentDto,
  ServiceParty,
  ServiceRequestFeedbackPayload,
  ServiceRequestIntent,
  ServiceRequestMessageDto,
  ServiceRequesterAnswer,
  ServiceRequesterReason,
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
      RequesterNote: payload.requesterNote?.trim() || null,
      Intent: payload.intent ?? null
    };

    return this.api.post<unknown>(this.endpoint, body).pipe(map(response => this.toRequest(response)));
  }

  /** The conversation of a request, oldest first. Allowed for the customer, the provider and an admin (read-only). */
  getMessages(id: string): Observable<ServiceRequestMessageDto[]> {
    return this.api
      .get<ServiceRequestMessageDto[] | ApiPagedResult<ServiceRequestMessageDto>>(`${this.endpoint}/${id}/messages`)
      .pipe(map(response => unwrapItems(response).map(item => this.toMessage(item))));
  }

  sendMessage(id: string, body: string): Observable<ServiceRequestMessageDto> {
    return this.api
      .post<unknown>(`${this.endpoint}/${id}/messages`, { Body: body.trim() })
      .pipe(map(response => this.toMessage(response)));
  }

  /** Opening the thread marks the other side's messages as read. */
  markMessagesRead(id: string): Observable<void> {
    return this.api.put<unknown>(`${this.endpoint}/${id}/messages/read`, {}).pipe(map(() => undefined));
  }

  /** The customer confirms: the inquiry becomes a request and the provider has to answer it. */
  confirm(id: string): Observable<ServiceRequestDto> {
    return this.api.put<unknown>(`${this.endpoint}/${id}/confirm`, {}).pipe(map(response => this.toRequest(response)));
  }

  cancel(id: string, reason?: string | null, requesterReason?: ServiceRequesterReason | null): Observable<ServiceRequestDto> {
    return this.api
      .put<unknown>(`${this.endpoint}/${id}/cancel`, { Reason: reason ?? null, RequesterReason: requesterReason ?? null })
      .pipe(map(response => this.toRequest(response)));
  }

  /** The customer answers "is the provider's outcome right?" and gives their own reason. */
  sendFeedback(id: string, payload: ServiceRequestFeedbackPayload): Observable<ServiceRequestDto> {
    const body = {
      Answer: payload.answer,
      Reason: payload.reason ?? null,
      Note: payload.note?.trim() || null
    };
    return this.api.put<unknown>(`${this.endpoint}/${id}/feedback`, body).pipe(map(response => this.toRequest(response)));
  }

  addReview(id: string, payload: AddServiceReviewPayload): Observable<ServiceReviewDto> {
    const body = { Rating: payload.rating, Comment: payload.comment ?? null };
    return this.api.post<unknown>(`${this.endpoint}/${id}/review`, body).pipe(map(response => this.toReview(response)));
  }

  // -------------------------------------------------------------------------
  // Provider side — ActorUserId is resolved to a ServiceProvider server-side on
  // every one of these (ServiceRequestsController), so no providerId is passed
  // from here.
  // -------------------------------------------------------------------------

  getProviderInbox(status?: ServiceRequestStatus): Observable<ServiceRequestDto[]> {
    const query: Record<string, string | undefined> = {};
    if (status) query['status'] = status;

    return this.api
      .get<ServiceRequestDto[] | ApiPagedResult<ServiceRequestDto>>(`${this.endpoint}/provider-inbox`, query)
      .pipe(map(response => unwrapItems(response).map(item => this.toRequest(item))));
  }

  getDocuments(id: string): Observable<ServiceRequestDocumentDto[]> {
    return this.api
      .get<ServiceRequestDocumentDto[] | ApiPagedResult<ServiceRequestDocumentDto>>(`${this.endpoint}/${id}/documents`)
      .pipe(map(response => unwrapItems(response).map(item => this.toDocument(item))));
  }

  uploadDocument(id: string, file: File): Observable<ServiceRequestDocumentDto> {
    const formData = new FormData();
    formData.append('file', file);

    return this.api
      .upload<unknown>(`${this.endpoint}/${id}/documents`, formData)
      .pipe(map(response => this.toDocument(response)));
  }

  accept(id: string, payload: AcceptServiceRequestPayload): Observable<ServiceRequestDto> {
    const body = {
      QuotedPrice: payload.quotedPrice ?? null,
      QuotedPriceCurrencyId: payload.quotedPriceCurrencyId ?? null,
      ProviderNote: payload.providerNote?.trim() || null
    };

    return this.api.put<unknown>(`${this.endpoint}/${id}/accept`, body).pipe(map(response => this.toRequest(response)));
  }

  reject(id: string, reason: string, reasonCode?: ServiceOutcomeReason | null): Observable<ServiceRequestDto> {
    return this.api
      .put<unknown>(`${this.endpoint}/${id}/reject`, { Reason: reason.trim(), ReasonCode: reasonCode ?? null })
      .pipe(map(response => this.toRequest(response)));
  }

  /** The provider closes an accepted request as not delivered, with a reason from the list. */
  markNotCompleted(id: string, payload: NotCompletedServiceRequestPayload): Observable<ServiceRequestDto> {
    const body = { Reason: payload.reason, Note: payload.note?.trim() || null };
    return this.api.put<unknown>(`${this.endpoint}/${id}/not-completed`, body).pipe(map(response => this.toRequest(response)));
  }

  schedule(id: string, scheduledAtIso: string): Observable<ServiceRequestDto> {
    return this.api
      .put<unknown>(`${this.endpoint}/${id}/schedule`, { ScheduledAt: scheduledAtIso })
      .pipe(map(response => this.toRequest(response)));
  }

  start(id: string): Observable<ServiceRequestDto> {
    return this.api.put<unknown>(`${this.endpoint}/${id}/start`, {}).pipe(map(response => this.toRequest(response)));
  }

  complete(id: string, payload: CompleteServiceRequestPayload): Observable<ServiceRequestDto> {
    const body = {
      FinalPrice: payload.finalPrice ?? null,
      FinalPriceCurrencyId: payload.finalPriceCurrencyId ?? null
    };

    return this.api.put<unknown>(`${this.endpoint}/${id}/complete`, body).pipe(map(response => this.toRequest(response)));
  }

  private toDocument(raw: unknown): ServiceRequestDocumentDto {
    const d = raw as Record<string, unknown>;
    return {
      id: String(d['id'] ?? ''),
      serviceRequestId: String(d['serviceRequestId'] ?? ''),
      fileUrl: String(d['fileUrl'] ?? ''),
      fileType: String(d['fileType'] ?? ''),
      fileName: String(d['fileName'] ?? ''),
      uploadedByUserId: String(d['uploadedByUserId'] ?? ''),
      createdAt: String(d['createdAt'] ?? '')
    };
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
      createdAt: String(r['createdAt'] ?? ''),
      updatedAt: (r['updatedAt'] as string | null | undefined) ?? null,
      providerContact: (r['providerContact'] as ServiceRequestDto['providerContact']) ?? null,
      outcomeReason: (r['outcomeReason'] as ServiceOutcomeReason | null | undefined) ?? null,
      outcomeNote: (r['outcomeNote'] as string | null | undefined) ?? null,
      notCompletedAt: (r['notCompletedAt'] as string | null | undefined) ?? null,
      requesterAnswer: (r['requesterAnswer'] as ServiceRequesterAnswer | null | undefined) ?? null,
      requesterReason: (r['requesterReason'] as ServiceRequesterReason | null | undefined) ?? null,
      requesterFeedbackNote: (r['requesterFeedbackNote'] as string | null | undefined) ?? null,
      requesterFeedbackAt: (r['requesterFeedbackAt'] as string | null | undefined) ?? null,
      intent: (r['intent'] as ServiceRequestIntent | null | undefined) ?? null,
      confirmedAt: (r['confirmedAt'] as string | null | undefined) ?? null,
      lastActivityAt: (r['lastActivityAt'] as string | null | undefined) ?? null,
      expiredAt: (r['expiredAt'] as string | null | undefined) ?? null,
      expiredWaitingOn: (r['expiredWaitingOn'] as ServiceParty | null | undefined) ?? null,
      messageCount: Number(r['messageCount'] ?? 0),
      unreadMessageCount: Number(r['unreadMessageCount'] ?? 0),
      lastMessageAt: (r['lastMessageAt'] as string | null | undefined) ?? null
    };
  }

  private toMessage(raw: unknown): ServiceRequestMessageDto {
    const m = raw as Record<string, unknown>;
    return {
      id: String(m['id'] ?? ''),
      serviceRequestId: String(m['serviceRequestId'] ?? ''),
      senderParty: (m['senderParty'] as ServiceParty) ?? 'Requester',
      senderName: String(m['senderName'] ?? ''),
      body: String(m['body'] ?? ''),
      createdAt: String(m['createdAt'] ?? ''),
      readAt: (m['readAt'] as string | null | undefined) ?? null,
      isMine: m['isMine'] === true
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
