// src/app/core/api/service-provider.service.ts
//
// HudhudNest Services Marketplace — the provider's own profile.
// Endpoints:
//   GET  /api/ServiceProviders/me   ← 204 NoContent إن لم يكن الحساب مزوّد خدمة بعد
//   PUT  /api/ServiceProviders/me   ← تحديث الاسم/النبذة/معلومات التواصل
//
// نمط الـ cache مطابق لـ ProfileService (BehaviorSubject + refresh()) — الـ Navbar
// وProviderGuard كلاهما بحاجة لقراءة "هل هذا الحساب مزوّد خدمة؟" دون أن يُكرّر كل
// مستهلك طلب HTTP خاصاً به.

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { BackendApiService } from './backend-api.service';
import { ServiceProviderDto, UpdateServiceProviderProfilePayload } from '../models/service.model';

@Injectable({ providedIn: 'root' })
export class ServiceProviderService {
  private readonly endpoint = '/ServiceProviders';

  /** null = "loaded, not a provider" (أو خرج من الحساب). undefined = "لم يُحمَّل بعد". */
  private readonly myProviderSubject = new BehaviorSubject<ServiceProviderDto | null | undefined>(undefined);
  readonly myProvider$: Observable<ServiceProviderDto | null | undefined> = this.myProviderSubject.asObservable();

  constructor(private readonly api: BackendApiService) {}

  /** GET /me — 204 NoContent يُترجَم بـ HttpClient إلى body === null تلقائياً، فيصبح
   * "غير مزوّد خدمة" حالة نجاح عادية، لا خطأ يُلتقَط بـ catchError. */
  getMine(): Observable<ServiceProviderDto | null> {
    return this.api
      .get<unknown>(`${this.endpoint}/me`)
      .pipe(
        map(raw => (raw ? this.toProvider(raw) : null)),
        tap(provider => this.myProviderSubject.next(provider))
      );
  }

  /** أعِد التحميل بعد أي تغيير (مثال: الإدارة فعّلت الحساب كمزوّد خدمة حديثاً) كي يلتقط
   * الـ Navbar/Guard القيمة الجديدة فوراً بدل الانتظار للتحميل التالي المستقل. */
  refresh(): Observable<ServiceProviderDto | null> {
    return this.getMine();
  }

  clearCache(): void {
    this.myProviderSubject.next(undefined);
  }

  updateMine(payload: UpdateServiceProviderProfilePayload): Observable<ServiceProviderDto> {
    const body = {
      DisplayName: payload.displayName.trim(),
      Bio: payload.bio?.trim() || null,
      ContactEmail: payload.contactEmail?.trim() || null,
      ContactPhone: payload.contactPhone?.trim() || null
    };

    return this.api
      .put<unknown>(`${this.endpoint}/me`, body)
      .pipe(
        map(raw => this.toProvider(raw)),
        tap(provider => this.myProviderSubject.next(provider))
      );
  }

  private toProvider(raw: unknown): ServiceProviderDto {
    const p = raw as Record<string, unknown>;
    return {
      id: String(p['id'] ?? ''),
      userId: String(p['userId'] ?? ''),
      agencyId: (p['agencyId'] as string | null | undefined) ?? null,
      displayName: String(p['displayName'] ?? ''),
      bio: p['bio'] as string | null | undefined,
      logoUrl: p['logoUrl'] as string | null | undefined,
      contactEmail: p['contactEmail'] as string | null | undefined,
      contactPhone: p['contactPhone'] as string | null | undefined,
      verificationLevel: (p['verificationLevel'] as ServiceProviderDto['verificationLevel']) ?? 'None',
      isActive: Boolean(p['isActive']),
      status: (p['status'] as ServiceProviderDto['status']) ?? (p['isActive'] ? 'Active' : 'Suspended'),
      statusReason: (p['statusReason'] as string | null | undefined) ?? null,
      approvedCategories: (p['approvedCategories'] as ServiceProviderDto['approvedCategories']) ?? [],
      coverageGovernorateIds: (p['coverageGovernorateIds'] as number[] | undefined) ?? [],
      averageRating: p['averageRating'] as number | null | undefined,
      reviewCount: Number(p['reviewCount'] ?? 0),
      createdAt: String(p['createdAt'] ?? '')
    };
  }
}
