// =============================================================
// src/app/admin/marketing/admin-marketing.page.ts
//
// لوحة تحكم مصغّرة لصفحة الهبوط: العروض ("أول 100 مكتب")، العملاء
// المحتملون (Leads)، ونتائج استبيان الاستعداد للدفع. كل شيء عبر
// AdminMarketingService (Admin فقط على الخادم). صفحة عربية بالكامل —
// بلا i18n مقصودًا (أداة إدارية داخلية، تمامًا كصفحة الهبوط نفسها).
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';

import {
  AdminLeadDto,
  AdminMarketingService,
  AdminOfferDto,
  AdminSurveyResponseDto,
  MarketingEventsSummaryDto,
  OfferFormValue,
  OfferStatus,
  SurveyStatsDto,
} from '../../core/api/admin-marketing.service';
import { ToastService } from '../../shared/services/toast.service';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

type Tab = 'offers' | 'leads' | 'surveys' | 'analytics';

const EVENT_TYPE_LABELS: Record<string, string> = {
  PageView: 'مشاهدات الصفحة',
  CtaClick: 'ضغطات زر الدعوة للإجراء',
  FormStart: 'بدء تعبئة النموذج',
  FormComplete: 'إتمام التسجيل',
  PricingView: 'مشاهدة الأسعار',
  PlanSelect: 'اختيار باقة',
  SurveyStart: 'بدء الاستبيان',
  SurveySubmit: 'إتمام الاستبيان',
  DemoRequest: 'طلب عرض توضيحي',
};

/** ترتيب عرض ثابت يقارب مسار التحويل الفعلي، بدل ترتيب عشوائي حسب مفاتيح الكائن. */
const EVENT_TYPE_ORDER = [
  'PageView', 'CtaClick', 'FormStart', 'FormComplete',
  'PricingView', 'PlanSelect', 'SurveyStart', 'SurveySubmit', 'DemoRequest',
];

const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  Draft: 'مسودة',
  Active: 'نشط',
  Paused: 'موقوف مؤقتًا',
  Ended: 'منتهٍ',
};

const DISCOUNT_TYPE_LABELS: Record<string, string> = {
  Percentage: 'نسبة مئوية',
  FixedAmountUsd: 'مبلغ ثابت ($)',
  FreeMonths: 'أشهر مجانية',
};

const USER_TYPE_LABELS: Record<string, string> = {
  renter: 'باحث عن إيجار',
  buyer: 'باحث عن شراء',
  owner: 'صاحب عقار',
  agency: 'مكتب عقاري',
  investor: 'مستثمر / مغترب',
};

const WILLINGNESS_LABELS: Record<string, string> = {
  Yes: 'نعم',
  No: 'لا',
  Maybe: 'ربما',
};

const PAYMENT_MODEL_LABELS: Record<string, string> = {
  MonthlySubscription: 'اشتراك شهري',
  YearlySubscription: 'اشتراك سنوي',
  PerListingFee: 'رسم لكل إعلان',
  CommissionOnSale: 'عمولة عند البيع',
  Mixed: 'نموذج مختلط',
};

@Component({
  selector: 'app-admin-marketing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LoadingSpinnerComponent, EmptyStateComponent],
  templateUrl: './admin-marketing.page.html',
  styleUrls: ['./admin-marketing.page.scss'],
})
export class AdminMarketingPage implements OnInit {
  private readonly api = inject(AdminMarketingService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly activeTab = signal<Tab>('offers');
  private readonly loadedTabs = new Set<Tab>();

  // ── العروض ──
  readonly offers = signal<AdminOfferDto[]>([]);
  readonly offersLoading = signal(true);
  readonly showOfferForm = signal(false);
  readonly editingOfferId = signal<string | null>(null);
  readonly savingOffer = signal(false);
  readonly settingStatusId = signal<string | null>(null);

  readonly offerForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: ['', Validators.maxLength(1000)],
    discountType: ['Percentage' as OfferFormValue['discountType'], Validators.required],
    discountValue: [10, [Validators.required, Validators.min(0.01)]],
    targetPlanTier: [''],
    startsAtUtc: [this.toDatetimeLocal(new Date()), Validators.required],
    endsAtUtc: [''],
    maxRedemptions: [100 as number | null],
    terms: ['', Validators.maxLength(2000)],
  });

  // ── العملاء المحتملون ──
  readonly leads = signal<AdminLeadDto[]>([]);
  readonly leadsLoading = signal(true);
  readonly leadsPage = signal(1);
  readonly leadsTotalPages = signal(1);
  leadSourceFilter = '';
  leadUserTypeFilter = '';

  // ── الاستبيان ──
  readonly surveyStats = signal<SurveyStatsDto | null>(null);
  readonly surveyResponses = signal<AdminSurveyResponseDto[]>([]);
  readonly surveysLoading = signal(true);
  readonly surveysPage = signal(1);
  readonly surveysTotalPages = signal(1);

  // ── التحويل (Analytics) ──
  readonly analyticsSummary = signal<MarketingEventsSummaryDto | null>(null);
  readonly analyticsLoading = signal(true);
  /** فارغ = "آخر 30 يومًا" (نفس افتراضي الخادم) — قيم input[type=date] عند التغيير. */
  analyticsFromDate = '';
  analyticsToDate = '';

  private readonly pageSize = 20;

  ngOnInit(): void {
    this.loadOffers();
    this.loadedTabs.add('offers');
  }

  selectTab(tab: Tab): void {
    this.activeTab.set(tab);

    if (this.loadedTabs.has(tab)) return;
    this.loadedTabs.add(tab);

    if (tab === 'leads') this.loadLeads();
    if (tab === 'surveys') this.loadSurveys();
    if (tab === 'analytics') this.loadAnalytics();
  }

  // ═══════════════════ العروض ═══════════════════

  loadOffers(): void {
    this.offersLoading.set(true);
    this.api.getOffers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: offers => {
          this.offers.set(offers ?? []);
          this.offersLoading.set(false);
        },
        error: () => {
          this.toast.error('تعذّر تحميل قائمة العروض.');
          this.offersLoading.set(false);
        },
      });
  }

  offerStatusLabel(status: OfferStatus): string {
    return OFFER_STATUS_LABELS[status] ?? status;
  }

  discountTypeLabel(type: string): string {
    return DISCOUNT_TYPE_LABELS[type] ?? type;
  }

  formatDiscount(offer: AdminOfferDto): string {
    switch (offer.discountType) {
      case 'Percentage': return `${offer.discountValue}%`;
      case 'FixedAmountUsd': return `${offer.discountValue}$`;
      case 'FreeMonths': return `${offer.discountValue} شهر`;
      default: return String(offer.discountValue);
    }
  }

  openCreateOfferForm(): void {
    this.editingOfferId.set(null);
    this.offerForm.reset({
      name: '',
      description: '',
      discountType: 'Percentage',
      discountValue: 10,
      targetPlanTier: '',
      startsAtUtc: this.toDatetimeLocal(new Date()),
      endsAtUtc: '',
      maxRedemptions: 100,
      terms: '',
    });
    this.showOfferForm.set(true);
  }

  openEditOfferForm(offer: AdminOfferDto): void {
    this.editingOfferId.set(offer.id);
    this.offerForm.reset({
      name: offer.name,
      description: offer.description ?? '',
      discountType: offer.discountType,
      discountValue: offer.discountValue,
      targetPlanTier: offer.targetPlanTier ?? '',
      startsAtUtc: this.toDatetimeLocal(new Date(offer.startsAtUtc)),
      endsAtUtc: offer.endsAtUtc ? this.toDatetimeLocal(new Date(offer.endsAtUtc)) : '',
      maxRedemptions: offer.maxRedemptions,
      terms: offer.terms ?? '',
    });
    this.showOfferForm.set(true);
  }

  closeOfferForm(): void {
    this.showOfferForm.set(false);
    this.editingOfferId.set(null);
  }

  saveOffer(): void {
    this.offerForm.markAllAsTouched();
    if (this.offerForm.invalid) return;

    const raw = this.offerForm.getRawValue();
    const value: OfferFormValue = {
      name: raw.name.trim(),
      description: raw.description?.trim() || null,
      discountType: raw.discountType,
      discountValue: Number(raw.discountValue),
      targetPlanTier: raw.targetPlanTier?.trim() || null,
      startsAtUtc: new Date(raw.startsAtUtc).toISOString(),
      endsAtUtc: raw.endsAtUtc ? new Date(raw.endsAtUtc).toISOString() : null,
      maxRedemptions: raw.maxRedemptions === null || raw.maxRedemptions === undefined || `${raw.maxRedemptions}` === ''
        ? null
        : Number(raw.maxRedemptions),
      terms: raw.terms?.trim() || null,
    };

    this.savingOffer.set(true);
    const editingId = this.editingOfferId();
    const request: Observable<unknown> = editingId
      ? this.api.updateOffer(editingId, value)
      : this.api.createOffer(value);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.toast.success(editingId ? 'تم تحديث العرض بنجاح.' : 'تم إنشاء العرض بنجاح (كمسودة — فعّله لإظهاره في الصفحة).');
        this.savingOffer.set(false);
        this.closeOfferForm();
        this.loadOffers();
      },
      error: err => {
        this.toast.error(err?.error?.message || 'تعذّر حفظ العرض. تحقق من البيانات وحاول مجددًا.');
        this.savingOffer.set(false);
      },
    });
  }

  changeOfferStatus(offer: AdminOfferDto, status: OfferStatus): void {
    if (status === 'Ended') {
      const confirmed = confirm(`هل أنت متأكد من إنهاء العرض "${offer.name}"؟ لا يمكن التراجع عن هذا الإجراء.`);
      if (!confirmed) return;
    }

    this.settingStatusId.set(offer.id);
    this.api.setOfferStatus(offer.id, status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.offers.update(items =>
            items.map(o => (o.id === offer.id ? { ...o, status } : o))
          );
          this.toast.success('تم تحديث حالة العرض.');
          this.settingStatusId.set(null);
        },
        error: () => {
          this.toast.error('تعذّر تحديث حالة العرض.');
          this.settingStatusId.set(null);
        },
      });
  }

  private toDatetimeLocal(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  // ═══════════════════ العملاء المحتملون ═══════════════════

  loadLeads(): void {
    this.leadsLoading.set(true);
    this.api.getLeads(this.leadsPage(), this.pageSize, {
      source: this.leadSourceFilter || undefined,
      userType: this.leadUserTypeFilter || undefined,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.leads.set(result.items);
          this.leadsTotalPages.set(result.totalPages);
          this.leadsLoading.set(false);
        },
        error: () => {
          this.toast.error('تعذّر تحميل قائمة العملاء المحتملين.');
          this.leadsLoading.set(false);
        },
      });
  }

  applyLeadFilters(): void {
    this.leadsPage.set(1);
    this.loadLeads();
  }

  goToLeadsPage(page: number): void {
    this.leadsPage.set(page);
    this.loadLeads();
  }

  userTypeLabel(userType: string): string {
    return USER_TYPE_LABELS[userType] ?? userType;
  }

  exportLeadsCsv(): void {
    const rows = this.leads();
    if (rows.length === 0) {
      this.toast.error('لا يوجد عملاء محتملون في الصفحة الحالية للتصدير.');
      return;
    }

    const header = ['الاسم', 'الهاتف', 'المدينة', 'النوع', 'المصدر', 'العرض', 'الحالة', 'تاريخ التسجيل'];
    const csvRows = rows.map(l => [
      l.fullName, l.phone, l.city, this.userTypeLabel(l.userType), l.source,
      l.offerName ?? '', l.status, new Date(l.createdAt).toLocaleString('ar'),
    ]);

    const csv = [header, ...csvRows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    // BOM لضمان عرض صحيح للعربية عند فتح الملف في Excel.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leads-page-${this.leadsPage()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ═══════════════════ الاستبيان ═══════════════════

  loadSurveys(): void {
    this.surveysLoading.set(true);

    this.api.getSurveyStats()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: stats => this.surveyStats.set(stats),
        error: () => this.toast.error('تعذّر تحميل إحصائيات الاستبيان.'),
      });

    this.api.getSurveyResponses(this.surveysPage(), this.pageSize)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.surveyResponses.set(result.items);
          this.surveysTotalPages.set(result.totalPages);
          this.surveysLoading.set(false);
        },
        error: () => {
          this.toast.error('تعذّر تحميل ردود الاستبيان.');
          this.surveysLoading.set(false);
        },
      });
  }

  goToSurveysPage(page: number): void {
    this.surveysPage.set(page);
    this.loadSurveys();
  }

  willingnessLabel(value: string): string {
    return WILLINGNESS_LABELS[value] ?? value;
  }

  paymentModelLabel(value: string): string {
    return PAYMENT_MODEL_LABELS[value] ?? value;
  }

  breakdownEntries(breakdown: Record<string, number> | undefined): { key: string; count: number }[] {
    if (!breakdown) return [];
    return Object.entries(breakdown).map(([key, count]) => ({ key, count }));
  }

  // ═══════════════════ التحويل (Analytics) ═══════════════════

  loadAnalytics(): void {
    this.analyticsLoading.set(true);

    // input[type=date] يعطي "YYYY-MM-DD" فقط — نهاية اليوم المحدَّد تُضبط
    // بمنتصف الليل UTC، وهو تقريب مقبول لأداة إدارية داخلية.
    const fromUtc = this.analyticsFromDate ? new Date(this.analyticsFromDate).toISOString() : undefined;
    const toUtc = this.analyticsToDate ? new Date(this.analyticsToDate).toISOString() : undefined;

    this.api.getMarketingEventsSummary(fromUtc, toUtc)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: summary => {
          this.analyticsSummary.set(summary);
          this.analyticsLoading.set(false);
        },
        error: () => {
          this.toast.error('تعذّر تحميل إحصائيات التحويل.');
          this.analyticsLoading.set(false);
        },
      });
  }

  applyAnalyticsRange(): void {
    this.loadAnalytics();
  }

  eventTypeLabel(type: string): string {
    return EVENT_TYPE_LABELS[type] ?? type;
  }

  /** يحافظ على ترتيب مسار التحويل المنطقي بدل ترتيب مفاتيح الكائن العشوائي،
   *  ويضيف الأنواع التي لم تُسجَّل بعد كصفر بدل حذفها من العرض تمامًا. */
  orderedEventCounts(summary: MarketingEventsSummaryDto | null): { key: string; count: number }[] {
    const counts = summary?.countsByEventType ?? {};
    return EVENT_TYPE_ORDER.map(key => ({ key, count: counts[key] ?? 0 }));
  }

  eventCount(summary: MarketingEventsSummaryDto | null, type: string): number {
    return summary?.countsByEventType?.[type] ?? 0;
  }

  /** null إذا كان المقام صفرًا — لا نعرض "0%" مضلِّلة حين لا توجد بيانات كافية. */
  conversionRate(summary: MarketingEventsSummaryDto | null, from: string, to: string): number | null {
    const denominator = this.eventCount(summary, from);
    if (denominator === 0) return null;
    return (this.eventCount(summary, to) / denominator) * 100;
  }
}
