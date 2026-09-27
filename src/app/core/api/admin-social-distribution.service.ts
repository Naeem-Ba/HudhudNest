// يغلّف الجزء "التشغيلي الأساسي" من SocialDistributionController على الباك-إند
// (PropertyApi.Controllers.SocialDistributionController) — القنوات، الحسابات (بما فيها
// ربط/فصل بيانات الاعتماد)، ملخص لوحة التحكم، وقائمة المنشورات للعرض فقط. كل نقطة هنا
// تتطلب دور Admin على الخادم ([Authorize(Roles = "Admin")]).
//
// عمداً خارج هذه الجولة (قواعد التوزيع Distribution Rules، حلّ Dead Letters، توليد
// الأصول): الـAPI جاهز لها بالكامل على الباك-إند، لكن الواجهة تقتصر الآن على ما يلزم
// لعرض الحالة وربط الحسابات الحقيقية فعلياً بدل Postman/curl.
//
//   GET  /api/social-distribution/dashboard/summary
//   GET  /api/social-distribution/channels
//   POST /api/social-distribution/channels
//   POST /api/social-distribution/channels/{id}/activate
//   POST /api/social-distribution/channels/{id}/deactivate
//   GET  /api/social-distribution/accounts               ← مُرقَّمة، تصفية بالمنصة/المحافظة/الحالة
//   POST /api/social-distribution/accounts
//   POST /api/social-distribution/accounts/{id}/connect     ← بيانات الاعتماد الفعلية، تُشفَّر فوراً
//                                                              على الخادم ولا تُعاد أبداً في أي استجابة
//   POST /api/social-distribution/accounts/{id}/disconnect
//   GET  /api/social-distribution/publications             ← مُرقَّمة، للعرض فقط في هذه الجولة
//
// كل الحقول camelCase، وكل enum كسلسلة نصية (JsonStringEnumConverter على الباك-إند).
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiPagedResult, PagedResult, normalizePagedResult } from '../models/api.model';
import { BackendApiService, QueryValue } from './backend-api.service';

export type SocialPlatform = 'Facebook' | 'Instagram' | 'Telegram' | 'TikTok' | 'YouTube' | 'LinkedIn';
export type SocialChannelStatus = 'Active' | 'Inactive' | 'Deprecated';
export type SocialAccountStatus = 'PendingAuthorization' | 'Active' | 'Inactive' | 'Disconnected' | 'Suspended' | 'Expired';
export type SocialAccountType = 'Page' | 'Profile' | 'Channel' | 'BusinessAccount' | 'Group' | 'Organization' | 'Other';
export type SocialPublicationStatus = 'Draft' | 'Queued' | 'Publishing' | 'Published' | 'Failed' | 'Retrying' | 'Cancelled';

export interface SocialChannelDto {
  id: string;
  platform: SocialPlatform;
  name: string;
  status: SocialChannelStatus;
  configurationVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccountDto {
  id: string;
  socialChannelId: string;
  platform: SocialPlatform;
  displayName: string;
  externalAccountId: string;
  status: SocialAccountStatus;
  accountType: string;
  governorateId: number | null;
  /** لا يوجد أي حقل لبيانات الاعتماد نفسها هنا مطلقاً — هذا العَلَم فقط يخبر إن كان الحساب مربوطاً. */
  hasCredential: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccountFilter {
  platform?: SocialPlatform;
  governorateId?: number;
  status?: SocialAccountStatus;
  page?: number;
  pageSize?: number;
}

export interface PlatformCountDto {
  platform: SocialPlatform;
  publishedCount: number;
  failedCount: number;
}

export interface GovernorateCountDto {
  governorateId: number | null;
  publishedCount: number;
}

export interface SocialDashboardSummaryDto {
  publicationsToday: number;
  publicationsThisWeek: number;
  publicationsThisMonth: number;
  published: number;
  failed: number;
  queued: number;
  retrying: number;
  publishing: number;
  cancelled: number;
  deadLetterUnresolved: number;
  successRatePercent: number;
  failureRatePercent: number;
  byPlatform: PlatformCountDto[];
  byProvince: GovernorateCountDto[];
}

export interface SocialPublicationDto {
  id: string;
  propertyId: string;
  socialAccountId: string;
  status: SocialPublicationStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  publishedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  maxRetryCount: number;
  lastRetryAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialPublicationFilter {
  propertyId?: string;
  socialAccountId?: string;
  platform?: SocialPlatform;
  status?: SocialPublicationStatus;
  page?: number;
  pageSize?: number;
}

/** يطابق CreateSocialChannelRequest على الخادم حرفياً. */
export interface CreateSocialChannelValue {
  platform: SocialPlatform;
  name: string;
  configurationVersion: string | null;
}

/** يطابق CreateSocialAccountRequest على الخادم حرفياً. */
export interface CreateSocialAccountValue {
  socialChannelId: string;
  displayName: string;
  externalAccountId: string;
  accountType: SocialAccountType;
  governorateId: number | null;
}

@Injectable({ providedIn: 'root' })
export class AdminSocialDistributionService {
  private readonly endpoint = '/social-distribution';

  constructor(private readonly api: BackendApiService) {}

  getDashboardSummary(): Observable<SocialDashboardSummaryDto> {
    return this.api.get<SocialDashboardSummaryDto>(`${this.endpoint}/dashboard/summary`);
  }

  getChannels(): Observable<SocialChannelDto[]> {
    return this.api.get<SocialChannelDto[]>(`${this.endpoint}/channels`);
  }

  createChannel(value: CreateSocialChannelValue): Observable<SocialChannelDto> {
    return this.api.post<SocialChannelDto>(`${this.endpoint}/channels`, value);
  }

  activateChannel(id: string): Observable<SocialChannelDto> {
    return this.api.post<SocialChannelDto>(`${this.endpoint}/channels/${id}/activate`);
  }

  deactivateChannel(id: string): Observable<SocialChannelDto> {
    return this.api.post<SocialChannelDto>(`${this.endpoint}/channels/${id}/deactivate`);
  }

  getAccounts(filter: SocialAccountFilter = {}): Observable<PagedResult<SocialAccountDto>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = { page, pageSize };
    if (filter.platform) query['platform'] = filter.platform;
    if (filter.governorateId !== undefined) query['governorateId'] = filter.governorateId;
    if (filter.status) query['status'] = filter.status;

    return this.api
      .get<SocialAccountDto[] | ApiPagedResult<SocialAccountDto>>(`${this.endpoint}/accounts`, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }

  createAccount(value: CreateSocialAccountValue): Observable<SocialAccountDto> {
    return this.api.post<SocialAccountDto>(`${this.endpoint}/accounts`, value);
  }

  /** بيانات الاعتماد الفعلية (توكن البوت/الصفحة/الحساب) — تُرسَل مرة واحدة، تُشفَّر فوراً على الخادم، ولا تُعاد أبداً بعد ذلك. */
  connectAccount(id: string, credentialReference: string): Observable<SocialAccountDto> {
    return this.api.post<SocialAccountDto>(`${this.endpoint}/accounts/${id}/connect`, { credentialReference });
  }

  disconnectAccount(id: string): Observable<SocialAccountDto> {
    return this.api.post<SocialAccountDto>(`${this.endpoint}/accounts/${id}/disconnect`);
  }

  getPublications(filter: SocialPublicationFilter = {}): Observable<PagedResult<SocialPublicationDto>> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const query: Record<string, QueryValue> = { page, pageSize };
    if (filter.propertyId) query['propertyId'] = filter.propertyId;
    if (filter.socialAccountId) query['socialAccountId'] = filter.socialAccountId;
    if (filter.platform) query['platform'] = filter.platform;
    if (filter.status) query['status'] = filter.status;

    return this.api
      .get<SocialPublicationDto[] | ApiPagedResult<SocialPublicationDto>>(`${this.endpoint}/publications`, query)
      .pipe(map(response => normalizePagedResult(response, item => item, page, pageSize)));
  }
}
