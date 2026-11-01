// src/app/features/provider/provider-inbox.page.ts
//
// لوحة تحكم مزوّد الخدمة — الصندوق الوارد (Provider Inbox). أول شاشة كانت مفقودة بالكامل
// من الفرونت‌إند رغم أن الباك‌إند (ServiceRequestsController.GetProviderInbox +
// accept/reject/schedule/start/complete) جاهز منذ البداية — انظر [[social-sharing-feature]]-
// جارة هذا الملف من حيث النمط: بطاقات + تبويبات حالة، نفس أسلوب my-service-requests.page.ts
// تماماً لكن من جهة المزوّد لا الطالب. مصمَّمة موبايل-أولاً: كل إجراء (قبول/رفض/جدولة/بدء/
// إتمام) يفتح من بطاقة تفاصيل الطلب لا من هنا — هذه الصفحة قائمة استعراض وتصفية فقط.

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';

import { ServiceRequestService } from '../../core/api/service-request.service';
import { ServiceRequestDto, ServiceRequestStatus } from '../../core/models/service.model';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

@Component({
  selector: 'app-provider-inbox-page',
  standalone: true,
  imports: [ LocalizedDatePipe,CommonModule, RouterLink, TranslateModule],
  templateUrl: './provider-inbox.page.html',
  styleUrls: ['./provider-inbox.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProviderInboxPage implements OnInit {
  private readonly requestsApi = inject(ServiceRequestService);
  private readonly destroyRef = inject(DestroyRef);

  readonly requests = signal<ServiceRequestDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedStatus = signal<ServiceRequestStatus | 'All'>('All');

  // 'Reviewed' مستبعدة عمداً من تبويبات المزوّد — التقييم إجراء يخص الطالب فقط بعد
  // Completed، والمزوّد ليس له فعل يتخذه في تلك الحالة (انظر nextProviderAction).
  //
  // ✅ تصحيح (وُجد بتدقيق حيّ): 'UnderReview' كانت غائبة تماماً عن هذه القائمة رغم أنها
  // الحالة الفعلية الوحيدة لأي طلب وارد جديد فعلياً (انظر تعليق nextProviderAction
  // بـ service.model.ts) — بدونها، تبويب "بانتظار ردّك" الوحيد المتاح للتصفية كان
  // 'Submitted' الذي لا يحدث أبداً في الواقع، فيبدو وكأن لا طلبات جديدة إطلاقاً.
  readonly statuses: Array<ServiceRequestStatus | 'All'> =
    ['All', 'Inquiry', 'UnderReview', 'Accepted', 'Scheduled', 'InProgress', 'Completed', 'NotCompleted', 'Rejected', 'Cancelled', 'Expired'];

  readonly filteredRequests = computed(() => {
    const status = this.selectedStatus();
    return status === 'All' ? this.requests() : this.requests().filter(item => item.status === status);
  });

  /** Requests waiting for the provider's decision, plus inquiries whose last word is the customer's. */
  readonly pendingCount = computed(
    () => this.requests().filter(item =>
      item.status === 'Submitted' || item.status === 'UnderReview'
      || (item.status === 'Inquiry' && (item.unreadMessageCount ?? 0) > 0)).length
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.requestsApi.getProviderInbox()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: requests => { this.requests.set(requests); this.loading.set(false); },
        error: () => { this.error.set('PROVIDER.INBOX.LOAD_ERROR'); this.loading.set(false); }
      });
  }

  selectStatus(status: ServiceRequestStatus | 'All'): void {
    this.selectedStatus.set(status);
  }

  trackById(_: number, item: ServiceRequestDto): string { return item.id; }
}
