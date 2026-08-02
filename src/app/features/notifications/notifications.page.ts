// ═══════════════════════════════════════════════════════════════
// ✅ إصلاح L-2: استبدال signal<any[]> بـ signal<NotificationItem[]>
//
// المشكلة القديمة:
//   readonly notifications = signal<any[]>([]); ← يُعطِّل TypeScript type checking
//
// المشاكل الناتجة عن any[]:
//   - الـ IDE لا يُكمِّل الأسماء تلقائياً
//   - TypeScript لا يكتشف الأخطاء عند كتابة item.nonExistentField
//   - أي تغيير في الـ Backend API لا يُكتشف في compile time
//   - الكود يبدو "يعمل" لكن قد يفشل في Runtime
//
// الإصلاح:
//   استخدام NotificationItem المُعرَّف في notification.model.ts
//   مع دالة toNotificationItem() للتحويل الآمن من Backend response.
//
// التعليم — لماذا Typed Signals مهم؟
//   TypeScript = كود يصعب كسره
//   any         = تخلٍّ عن هذه الحماية
//   Type Safety = فريق يعمل بثقة ومشروع قابل للصيانة
// ═══════════════════════════════════════════════════════════════
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { NotificationsApiService } from '../../core/api/notifications-api.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ToastService } from '../../shared/services/toast.service';

// ✅ استيراد النموذج المُحدَّد بدلاً من any
import { NotificationItem, toNotificationItem } from '../../core/models/notification.model';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, TranslateModule, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <div>
          <h1>{{ 'NOTIFICATIONS.TITLE' | translate }}</h1>
          <p>{{ 'NOTIFICATIONS.SUBTITLE' | translate }}</p>
        </div>
        <button
          type="button"
          class="mark-all-btn"
          *ngIf="hasUnread()"
          [disabled]="markingAll()"
          (click)="markAllAsRead()"
        >
          {{ markingAll()
              ? ('COMMON.SAVING' | translate)
              : ('NOTIFICATIONS.MARK_ALL_READ' | translate) }}
        </button>
      </header>

      <p class="state">
        <span aria-hidden="true">●</span>
        {{ 'NOTIFICATIONS.CONNECTION_STATE' | translate }}: {{ notificationsApi.connectionState() }}
      </p>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state-card error" *ngIf="!loading() && error()" role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>{{ error() }}</p>
        <button type="button" (click)="load()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <app-empty-state
        *ngIf="!loading() && notifications().length === 0 && !error()"
        icon="🔔"
        [title]="'NOTIFICATIONS.EMPTY_TITLE' | translate"
        [message]="'NOTIFICATIONS.EMPTY_MESSAGE' | translate"
      ></app-empty-state>

      <div class="notifications-list" *ngIf="!loading() && notifications().length > 0 && !error()">
        <!--
          ✅ التحسين: trackBy يستخدم item.id الآن (مُحدَّد النوع)
          بدلاً من item?.id ?? item?.Id ?? index (any-style)
        -->
        <article
          class="card"
          *ngFor="let notification of notifications(); trackBy: trackById"
          [class.unread]="!notification.isRead"
        >
          <div>
            <!-- ✅ الحقول محددة النوع — TypeScript يكتشف الأخطاء compile-time -->
            <h2 class="line-clamp-2">{{ notification.message }}</h2>
            <small *ngIf="notification.createdAt">{{ notification.createdAt | date:'short' }}</small>
          </div>

          <div class="card-actions">
            <button type="button" [disabled]="notification.isRead" (click)="markAsRead(notification)">
              {{ notification.isRead
                 ? ('NOTIFICATIONS.READ' | translate)
                 : ('NOTIFICATIONS.MARK_READ' | translate) }}
            </button>
            <button
              type="button"
              class="dismiss-btn"
              [disabled]="dismissingId() === notification.id"
              (click)="dismiss(notification)"
              [attr.aria-label]="'NOTIFICATIONS.DISMISS' | translate"
            >
              {{ 'NOTIFICATIONS.DISMISS' | translate }}
            </button>
          </div>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header { display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem;flex-wrap:wrap; }
    .page-header h1 { margin:0 0 .35rem;font-size:clamp(1.6rem,3vw,2.2rem); }
    .page-header p { margin:0;color:#64748b;line-height:1.7; }
    .mark-all-btn { background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:10px;padding:.55rem 1rem;font-weight:600;cursor:pointer;white-space:nowrap; }
    .mark-all-btn:disabled { opacity:.6;cursor:default; }
    .state,.card,.state-card { background:#fff;padding:1rem;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,.08);border:1px solid #e2e8f0;margin-bottom:1rem; }
    .state { display:flex;gap:.5rem;align-items:center;color:#475569; }
    .state span { color:#16a34a; }
    .notifications-list { display:grid;gap:.85rem; }
    .card { display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start; }
    .card.unread { border-inline-start:5px solid #2563eb; }
    h2 { margin:0 0 .35rem;font-size:1.05rem; }
    p { margin:0;color:#475569;line-height:1.7; }
    small { display:inline-block;margin-top:.45rem;color:#94a3b8; }
    .card-actions { display:flex;flex-direction:column;gap:.4rem; }
    button { border:0;background:#1e3a5f;color:#fff;border-radius:10px;padding:.6rem 1rem;cursor:pointer;white-space:nowrap; }
    button:disabled { background:#cbd5e1;color:#475569; }
    .dismiss-btn { background:#f1f5f9;color:#475569; }
    .dismiss-btn:hover:not(:disabled) { background:#e2e8f0; }
    .state-card.error { display:flex;align-items:center;gap:.75rem;color:#b91c1c;background:#fff7f7;border-color:#fecaca; }
    .state-card p { flex:1;color:inherit; }
    .state-card button { background:#dc2626; }
    @media (max-width: 640px) { .card { grid-template-columns:1fr; } .card-actions { flex-direction:row; } button { width:100%; } }
  `]
})
export class NotificationsPage implements OnDestroy {
  readonly notificationsApi = inject(NotificationsApiService);
  private readonly toast = inject(ToastService);
  private readonly subscriptions = new Subscription();

  // ✅ إصلاح L-2: النوع المحدد بدلاً من any[]
  // TypeScript سيكتشف الآن أي خطأ في الوصول لحقل غير موجود
  readonly notifications = signal<NotificationItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly markingAll = signal(false);
  readonly dismissingId = signal<string | null>(null);

  readonly hasUnread = computed(() => this.notifications().some(n => !n.isRead));

  constructor() {
    this.load();
    this.notificationsApi.connect();

    // الاشتراك في الإشعارات الفورية من SignalR
    this.subscriptions.add(
      this.notificationsApi.realtime$.subscribe(rawNotification => {
        // ✅ تحويل آمن من Backend format إلى NotificationItem
        const notification = toNotificationItem(rawNotification);
        this.notifications.update(items => [notification, ...items]);
        this.toast.info(notification.message, 'إشعار جديد');
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.notificationsApi.getNotifications().subscribe({
      next: (items: unknown[]) => {
        // ✅ تحويل كل عنصر باستخدام toNotificationItem() بشكل صريح وآمن
        const typed: NotificationItem[] = (items ?? []).map(toNotificationItem);
        this.notifications.set(typed);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('يجب تسجيل الدخول لعرض الإشعارات أو تعذر تحميل البيانات.');
        this.loading.set(false);
      }
    });
  }

  // ✅ trackBy بنوع محدد: NotificationItem له id مضمون
  trackById(index: number, item: NotificationItem): string {
    return item.id || String(index);
  }

  markAsRead(item: NotificationItem): void {
    if (!item.id || item.isRead) return;

    this.notificationsApi.markAsRead(item.id).subscribe({
      next: () => {
        // تحديث الـ Signal بطريقة immutable (إنشاء object جديد)
        this.notifications.update(items =>
          items.map(n => n.id === item.id ? { ...n, isRead: true } : n)
        );
      },
      error: () => this.toast.error('تعذر تعليم الإشعار كمقروء.')
    });
  }

  markAllAsRead(): void {
    if (this.markingAll()) return;
    this.markingAll.set(true);

    this.notificationsApi.markAllAsRead().subscribe({
      next: () => {
        this.notifications.update(items => items.map(n => ({ ...n, isRead: true })));
        this.markingAll.set(false);
      },
      error: () => {
        this.toast.error('تعذر تعليم كل الإشعارات كمقروءة.');
        this.markingAll.set(false);
      }
    });
  }

  dismiss(item: NotificationItem): void {
    if (!item.id || this.dismissingId()) return;

    this.dismissingId.set(item.id);

    this.notificationsApi.softDelete(item.id).subscribe({
      next: () => {
        this.notifications.update(items => items.filter(n => n.id !== item.id));
        this.dismissingId.set(null);
      },
      error: () => {
        this.toast.error('تعذر تجاهل الإشعار.');
        this.dismissingId.set(null);
      }
    });
  }
}