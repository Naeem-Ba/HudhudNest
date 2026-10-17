// src/app/features/provider/provider-request-detail.page.ts
//
// لوحة تحكم مزوّد الخدمة — تفاصيل طلب واحد + الإجراء الوحيد المتاح حسب حالته الحالية
// (ServiceRequest state machine: Submitted → Accepted/Rejected → Scheduled → InProgress →
// Completed). زر واحد بارز في كل مرة بدل قائمة أزرار مربكة — nextProviderAction() بالنموذج
// يحدّد أيّها. سعر العرض/السعر النهائي اختياريان (DTO كلاهما decimal? بالباك اند)؛ إن أُدخل
// سعر، يُرسَل معه currencyId نفسه المضبوط على عرض الخدمة (ServiceOffering) الذي يخصّه هذا
// الطلب أصلاً — لا يوجد Lookup لعملات منفصل بالواجهة بعد، وهذا أدق افتراض متاح بدل تخمين رقم.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { ServiceRequestService } from '../../core/api/service-request.service';
import { ServiceOfferingService } from '../../core/api/service-offering.service';
import {
  ProviderAction,
  SERVICE_OUTCOME_REASONS,
  ServiceOutcomeReason,
  ServiceRequestDocumentDto,
  ServiceRequestDto,
  ServiceRequestStatusHistoryDto,
  canCloseRequest,
  nextProviderAction
} from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';

const MAX_DOCUMENT_SIZE = 5_000_000; // يطابق ServiceRequestsController.MaxDocumentSize بالباك اند.

@Component({
  selector: 'app-provider-request-detail-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslateModule],
  templateUrl: './provider-request-detail.page.html',
  styleUrls: ['./provider-request-detail.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProviderRequestDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly requestsApi = inject(ServiceRequestService);
  private readonly offeringsApi = inject(ServiceOfferingService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly requestId = this.route.snapshot.paramMap.get('id') ?? '';

  readonly request = signal<ServiceRequestDto | null>(null);
  readonly history = signal<ServiceRequestStatusHistoryDto[]>([]);
  readonly documents = signal<ServiceRequestDocumentDto[]>([]);
  readonly offeringCurrencyId = signal<number | null>(null);

  readonly loading = signal(true);
  readonly error = signal('');
  readonly submitting = signal(false);
  readonly uploading = signal(false);
  readonly uploadError = signal('');

  /** أي نموذج إجراء مفتوح حالياً: 'accept' | 'reject' | null — 'schedule'/'start'/'complete'
   * لها زر واحد فقط أو حقل واحد فلا تحتاج toggle منفصل بنفس التعقيد. */
  readonly openForm = signal<'accept' | 'reject' | 'done' | 'notdone' | null>(null);

  readonly outcomeReasons = SERVICE_OUTCOME_REASONS;
  readonly rejectReasonCode = signal<ServiceOutcomeReason | ''>('');
  readonly notDoneReason = signal<ServiceOutcomeReason | ''>('');
  readonly notDoneNote = signal('');

  readonly quotedPrice = signal<number | null>(null);
  readonly providerNote = signal('');
  readonly rejectReason = signal('');
  readonly scheduledAt = signal('');
  readonly finalPrice = signal<number | null>(null);

  readonly action = computed<ProviderAction>(() => {
    const r = this.request();
    return r ? nextProviderAction(r.status) : 'None';
  });

  /** Done / not done is available from the moment the request is accepted; scheduling and starting stay optional. */
  readonly canClose = computed(() => {
    const r = this.request();
    return !!r && canCloseRequest(r.status);
  });

  readonly canSubmitNotDone = computed(() => {
    if (this.submitting() || !this.notDoneReason()) return false;
    return this.notDoneReason() !== 'Other' || this.notDoneNote().trim().length > 0;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.requestId) {
      this.error.set('PROVIDER.DETAIL.NOT_FOUND');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set('');

    forkJoin({
      request: this.requestsApi.getById(this.requestId),
      history: this.requestsApi.getHistory(this.requestId),
      documents: this.requestsApi.getDocuments(this.requestId)
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ request, history, documents }) => {
          this.request.set(request);
          this.history.set(history);
          this.documents.set(documents);
          this.loading.set(false);
          this.loadOfferingCurrency(request.serviceOfferingId);
        },
        error: () => {
          this.error.set('PROVIDER.DETAIL.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private loadOfferingCurrency(offeringId: string): void {
    this.offeringsApi.getById(offeringId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: offering => this.offeringCurrencyId.set(offering.currencyId ?? null),
        // عرض قد يكون حُذف لاحقاً — سعر بلا عملة أفضل من فشل الصفحة كلها.
        error: () => this.offeringCurrencyId.set(null)
      });
  }

  openAcceptForm(): void {
    this.openForm.set('accept');
    this.quotedPrice.set(null);
    this.providerNote.set('');
  }

  openRejectForm(): void {
    this.openForm.set('reject');
    this.rejectReason.set('');
    this.rejectReasonCode.set('');
  }

  openDoneForm(): void {
    this.openForm.set('done');
    this.finalPrice.set(null);
  }

  openNotDoneForm(): void {
    this.openForm.set('notdone');
    this.notDoneReason.set('');
    this.notDoneNote.set('');
  }

  closeForm(): void {
    this.openForm.set(null);
  }

  submitAccept(): void {
    this.submitting.set(true);
    this.requestsApi.accept(this.requestId, {
      quotedPrice: this.quotedPrice(),
      quotedPriceCurrencyId: this.quotedPrice() !== null ? this.offeringCurrencyId() : null,
      providerNote: this.providerNote().trim() || null
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.onActionSuccess(updated, 'PROVIDER.DETAIL.ACCEPT_SUCCESS'),
        error: () => this.onActionError()
      });
  }

  submitReject(): void {
    if (!this.rejectReason().trim()) {
      return;
    }

    this.submitting.set(true);
    this.requestsApi.reject(this.requestId, this.rejectReason(), this.rejectReasonCode() || null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.onActionSuccess(updated, 'PROVIDER.DETAIL.REJECT_SUCCESS'),
        error: () => this.onActionError()
      });
  }

  submitSchedule(): void {
    if (!this.scheduledAt()) {
      return;
    }

    this.submitting.set(true);
    // <input type="datetime-local"> يُعيد توقيتاً محلياً بلا منطقة زمنية ("2026-09-20T14:30")؛
    // new Date(...) يفسّرها بتوقيت الجهاز المحلي ثم .toISOString() يحوّلها UTC — يطابق ما
    // يتوقعه DateTime.Parse بالباك اند (ScheduleServiceRequestRequest.ScheduledAt).
    const iso = new Date(this.scheduledAt()).toISOString();

    this.requestsApi.schedule(this.requestId, iso)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.onActionSuccess(updated, 'PROVIDER.DETAIL.SCHEDULE_SUCCESS'),
        error: () => this.onActionError()
      });
  }

  submitStart(): void {
    this.submitting.set(true);
    this.requestsApi.start(this.requestId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.onActionSuccess(updated, 'PROVIDER.DETAIL.START_SUCCESS'),
        error: () => this.onActionError()
      });
  }

  submitComplete(): void {
    this.submitting.set(true);
    this.requestsApi.complete(this.requestId, {
      finalPrice: this.finalPrice(),
      finalPriceCurrencyId: this.finalPrice() !== null ? this.offeringCurrencyId() : null
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.onActionSuccess(updated, 'PROVIDER.DETAIL.COMPLETE_SUCCESS'),
        error: () => this.onActionError()
      });
  }

  submitNotDone(): void {
    const reason = this.notDoneReason();
    if (!reason || !this.canSubmitNotDone()) return;

    this.submitting.set(true);
    this.requestsApi.markNotCompleted(this.requestId, { reason, note: this.notDoneNote().trim() || null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => this.onActionSuccess(updated, 'PROVIDER.DETAIL.NOT_DONE_SUCCESS'),
        error: () => this.onActionError()
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // يسمح باختيار نفس الملف مرتين متتاليتين (مثلاً بعد فشل الرفع)

    if (!file) {
      return;
    }

    this.uploadError.set('');

    if (file.size > MAX_DOCUMENT_SIZE) {
      this.uploadError.set('PROVIDER.DETAIL.DOCUMENT_TOO_LARGE');
      return;
    }

    this.uploading.set(true);
    this.requestsApi.uploadDocument(this.requestId, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: document => {
          this.documents.update(items => [...items, document]);
          this.uploading.set(false);
        },
        error: () => {
          this.uploadError.set('PROVIDER.DETAIL.UPLOAD_ERROR');
          this.uploading.set(false);
        }
      });
  }

  trackByDocId(_: number, item: ServiceRequestDocumentDto): string { return item.id; }
  trackByHistoryId(_: number, item: ServiceRequestStatusHistoryDto): string { return item.id; }

  private onActionSuccess(updated: ServiceRequestDto, messageKey: string): void {
    this.request.set(updated);
    this.openForm.set(null);
    this.submitting.set(false);
    // سجل الحالة تغيّر على الباك اند بهذا الإجراء — نعيد تحميله كي تظهر الحركة الجديدة
    // بالخط الزمني فوراً بدل انتظار رجوع المستخدم لهذه الصفحة لاحقاً.
    this.requestsApi.getHistory(this.requestId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: history => this.history.set(history), error: () => undefined });
    this.toast.show(this.translate.instant(messageKey), 'success');
  }

  private onActionError(): void {
    this.submitting.set(false);
    this.toast.show(this.translate.instant('SERVICE_REQUESTS.ACTION_ERROR'), 'error');
  }
}
