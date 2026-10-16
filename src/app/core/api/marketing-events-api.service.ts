// ─────────────────────────────────────────────────────────
// marketing-events-api.service.ts
// POST /api/marketing-events — قمع التحويل لصفحة الهبوط (عام، محدود المعدل على الخادم).
// لا بيانات شخصية: نوع الحدث + مسار الصفحة + معرّف العرض + وسم الحملة (utm_campaign) فقط.
// فشل التتبع صامت تمامًا: لا toast ولا خطأ يصل إلى الصفحة.
// ─────────────────────────────────────────────────────────
import { Injectable, inject } from '@angular/core';
import { HttpContext } from '@angular/common/http';
import { BackendApiService } from './backend-api.service';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';

export type TrackedMarketingEvent = 'PageView' | 'CtaClick' | 'FormStart' | 'FormComplete';

/** مطابق لحدّ الخادم (MarketingEventSubmitDto.Campaign ≤ 120) ولأحرف utm_campaign الآمنة. */
const SAFE_CAMPAIGN = /^[A-Za-z0-9_.-]{1,60}$/;

@Injectable({ providedIn: 'root' })
export class MarketingEventsApiService {
  private readonly api = inject(BackendApiService);

  track(
    eventType: TrackedMarketingEvent,
    details: { offerId?: string | null; campaign?: string | null; path?: string } = {},
  ): void {
    const campaign = details.campaign && SAFE_CAMPAIGN.test(details.campaign) ? details.campaign : undefined;

    this.api
      .post(
        '/marketing-events',
        {
          eventType,
          path: details.path ?? '/landing',
          offerId: details.offerId || undefined,
          campaign,
        },
        { context: new HttpContext().set(SKIP_ERROR_TOAST, true) },
      )
      .subscribe({ error: () => { /* تتبع اختياري: يفشل بصمت */ } });
  }
}
