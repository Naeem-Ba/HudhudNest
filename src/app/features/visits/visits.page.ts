import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { VisitService } from '../../core/api/visit.service';
import { AuthService } from '../../core/auth/auth.service';
import { VisitDto, VisitStatus } from '../../core/models/visit.model';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-visits-page',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslateModule],
  templateUrl: './visits.page.html',
  styleUrls: ['./visits.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VisitsPage implements OnInit {
  private readonly visitsApi = inject(VisitService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly visits = signal<VisitDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedStatus = signal<VisitStatus | 'All'>('All');
  readonly processingId = signal<string | null>(null);
  readonly statuses: Array<VisitStatus | 'All'> = ['All', 'Pending', 'Confirmed', 'Declined', 'Cancelled', 'Completed'];

  readonly filteredVisits = computed(() => {
    const status = this.selectedStatus();
    return status === 'All' ? this.visits() : this.visits().filter(item => item.status === status);
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.visitsApi.getMyVisits()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: visits => { this.visits.set(visits); this.loading.set(false); },
        error: () => { this.error.set('VISITS.LOAD_ERROR'); this.loading.set(false); }
      });
  }

  selectStatus(status: VisitStatus | 'All'): void { this.selectedStatus.set(status); }

  canManageAsOwner(visit: VisitDto): boolean {
    const userId = this.auth.getCurrentUserId();
    return !!userId && visit.ownerId === userId && visit.status === 'Pending';
  }

  /**
   * ✅ إضافة: إغلاق دورة حياة الزيارة — يستهلك PUT /api/visits/{id}/complete
   * الذي كان موجوداً بالباك اند (مالك العقار فقط، ويتحقق من الملكية) دون أي
   * زر أو دالة بالواجهة. تبقى الزيارة عالقة على "مؤكدة" للأبد بدون هذا الإجراء.
   */
  canComplete(visit: VisitDto): boolean {
    const userId = this.auth.getCurrentUserId();
    return !!userId && visit.ownerId === userId && visit.status === 'Confirmed';
  }

  canCancel(visit: VisitDto): boolean {
    const userId = this.auth.getCurrentUserId();
    return !!userId && visit.visitorId === userId && ['Pending', 'Confirmed'].includes(visit.status);
  }

  confirm(visit: VisitDto): void { this.runAction(visit.id, () => this.visitsApi.confirmVisit(visit.id), 'Confirmed'); }
  decline(visit: VisitDto): void { this.runAction(visit.id, () => this.visitsApi.declineVisit(visit.id), 'Declined'); }
  complete(visit: VisitDto): void { this.runAction(visit.id, () => this.visitsApi.completeVisit(visit.id), 'Completed'); }
  cancel(visit: VisitDto): void { this.runAction(visit.id, () => this.visitsApi.cancelVisit(visit.id), 'Cancelled'); }

  trackById(_: number, item: VisitDto): string { return item.id; }

  private runAction(id: string, action: () => import('rxjs').Observable<void>, status: VisitStatus): void {
    this.processingId.set(id);
    action().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.visits.update(items => items.map(item => item.id === id ? { ...item, status } : item));
        this.processingId.set(null);
        this.toast.show(this.translate.instant('VISITS.ACTION_SUCCESS'), 'success');
      },
      error: () => {
        this.processingId.set(null);
        this.toast.show(this.translate.instant('VISITS.ACTION_ERROR'), 'error');
      }
    });
  }
}
