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
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subscription, skip } from 'rxjs';
import { LanguageService } from '../../core/services/language.service';
import { NotificationsApiService } from '../../core/api/notifications-api.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ToastService } from '../../shared/services/toast.service';
import { PushOptInComponent } from '../../shared/ui/push-opt-in.component';

// ✅ استيراد النموذج المُحدَّد بدلاً من any
import { NotificationItem, toNotificationItem } from '../../core/models/notification.model';
import { routeForNotification } from '../../core/models/notification-route';

// ✅ إضافة: للتصرف بطلب الزيارة (تأكيد/رفض/موعد بديل) مباشرة من بطاقة
// الإشعار — بدل الاكتفاء بـ "تحديد كمقروء"/"تجاهل" فقط، ما كان يجبر
// المعلن على الانتقال يدويًا لصفحة /visits لإيجاد الطلب والرد عليه.
import { VisitService } from '../../core/api/visit.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [ LocalizedDatePipe,CommonModule, RouterLink, TranslateModule, EmptyStateComponent, LoadingSpinnerComponent, PushOptInComponent],
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

      <app-push-opt-in></app-push-opt-in>

      <div class="filters" role="group" [attr.aria-label]="'NOTIFICATIONS.FILTER_LABEL' | translate" *ngIf="categories().length > 1">
        <button type="button" class="chip" [class.active]="filter() === 'all'" [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">
          {{ 'NOTIFICATIONS.FILTER_ALL' | translate }}
        </button>
        <button type="button" class="chip" *ngFor="let category of categories()"
          [class.active]="filter() === category" [attr.aria-pressed]="filter() === category" (click)="filter.set(category)">
          {{ 'NOTIFICATIONS.CATEGORY.' + category | translate }}
        </button>
      </div>

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

      <p class="state" *ngIf="!loading() && !error() && notifications().length > 0 && visible().length === 0">
        {{ 'NOTIFICATIONS.FILTER_EMPTY' | translate }}
      </p>

      <div class="notifications-list" *ngIf="!loading() && visible().length > 0 && !error()">
        <!--
          ✅ التحسين: trackBy يستخدم item.id الآن (مُحدَّد النوع)
          بدلاً من item?.id ?? item?.Id ?? index (any-style)
        -->
        <article
          class="card"
          *ngFor="let notification of visible(); trackBy: trackById"
          [class.unread]="!notification.isRead"
          [class.high]="notification.priority === 'High'"
        >
          <div>
            <!-- ✅ الحقول محددة النوع — TypeScript يكتشف الأخطاء compile-time -->
            <h2 class="line-clamp-2">{{ notification.message }}</h2>
            <small *ngIf="notification.createdAt">{{ notification.createdAt | localDate:'short' }}</small>

            <a *ngIf="notification.type === 'PhoneVerification'" class="phone-verify-link" routerLink="/profile/phone-reverify">
              {{ 'AUTH.PHONE_VERIFY_NOW' | translate }}
            </a>

            <!-- رسالة جديدة → فتح المحادثة الخاصة بهذا العقار مباشرة -->
            <a *ngIf="notification.type === 'NewMessage' && notification.propertyId" class="phone-verify-link"
              [routerLink]="['/messages', notification.propertyId]">
              {{ 'MESSAGES.OPEN_CONVERSATION' | translate }}
            </a>

            <!-- ✅ إضافة: تأكيد/رفض/اقتراح موعد بديل — للمعلن، على إشعار "طلب زيارة جديد" -->
            <div class="visit-actions" *ngIf="notification.type === 'VisitRequested' && notification.relatedEntityId">
              <div class="visit-actions__row">
                <button
                  type="button"
                  class="confirm-btn"
                  [disabled]="respondingId() === notification.id"
                  (click)="confirmVisit(notification)"
                >
                  {{ 'NOTIFICATIONS.CONFIRM_VISIT' | translate }}
                </button>
                <button
                  type="button"
                  class="decline-btn"
                  [disabled]="respondingId() === notification.id"
                  (click)="declineVisit(notification)"
                >
                  {{ 'NOTIFICATIONS.DECLINE_VISIT' | translate }}
                </button>
                <button
                  type="button"
                  class="dismiss-btn"
                  [disabled]="respondingId() === notification.id"
                  (click)="toggleProposeForm(notification)"
                >
                  {{ 'NOTIFICATIONS.PROPOSE_ALTERNATE' | translate }}
                </button>
              </div>

              <!-- نموذج مصغّر لاقتراح موعد بديل — تاريخ ووقت منفصلان عمداً
                   (نفس نمط property-detail.page.html: visitDate/visitTime لا
                   datetime-local واحد يخلط الاثنين ويعتمد ترتيبه على لغة المتصفح). -->
              <form
                *ngIf="proposingId() === notification.id"
                class="propose-form"
                (ngSubmit)="submitPropose(notification, proposeDateInput.value, proposeTimeInput.value, proposeNoteInput.value)"
              >
                <div class="visit-actions__row">
                  <input #proposeDateInput type="date" [min]="minProposeDateAttr" required />
                  <input #proposeTimeInput type="time" required />
                </div>
                <textarea
                  #proposeNoteInput
                  rows="2"
                  [placeholder]="'NOTIFICATIONS.ALTERNATE_NOTE_PLACEHOLDER' | translate"
                ></textarea>
                <div class="visit-actions__row">
                  <button type="submit" class="confirm-btn" [disabled]="respondingId() === notification.id">
                    {{ 'NOTIFICATIONS.PROPOSE_ALTERNATE_SUBMIT' | translate }}
                  </button>
                  <button type="button" class="dismiss-btn" (click)="cancelProposeForm()">
                    {{ 'NOTIFICATIONS.PROPOSE_ALTERNATE_CANCEL' | translate }}
                  </button>
                </div>
              </form>
            </div>

            <!-- ✅ إضافة: قبول/رفض الموعد البديل — للزائر، على إشعار "اقترح المالك موعداً بديلاً" -->
            <div class="visit-actions" *ngIf="notification.type === 'VisitRescheduleProposed' && notification.relatedEntityId">
              <div class="visit-actions__row">
                <button
                  type="button"
                  class="confirm-btn"
                  [disabled]="respondingId() === notification.id"
                  (click)="acceptReschedule(notification)"
                >
                  {{ 'NOTIFICATIONS.ACCEPT_RESCHEDULE' | translate }}
                </button>
                <button
                  type="button"
                  class="decline-btn"
                  [disabled]="respondingId() === notification.id"
                  (click)="declineReschedule(notification)"
                >
                  {{ 'NOTIFICATIONS.DECLINE_RESCHEDULE' | translate }}
                </button>
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button type="button" class="open-btn" *ngIf="routeOf(notification)" (click)="open(notification)">
              {{ 'NOTIFICATIONS.OPEN' | translate }}
            </button>
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

      <div class="load-more" *ngIf="!loading() && !error() && hasMore()">
        <button type="button" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? ('COMMON.LOADING' | translate) : ('NOTIFICATIONS.LOAD_MORE' | translate) }}
        </button>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header { display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem;flex-wrap:wrap; }
    .page-header h1 { margin:0 0 .35rem;font-size:clamp(1.6rem,3vw,2.2rem); }
    .page-header p { margin:0;color:var(--gray-500);line-height:1.7; }
    .mark-all-btn { background:var(--primary-soft);color:var(--primary-text);border:1px solid rgba(214,168,79,.35);border-radius:10px;padding:.55rem 1rem;font-weight:600;cursor:pointer;white-space:nowrap; }
    .mark-all-btn:disabled { opacity:.6;cursor:default; }
    .state,.card,.state-card { background:var(--surface);padding:1rem;border-radius:16px;box-shadow:var(--shadow-md);border:1px solid var(--border);margin-bottom:1rem; }
    .state { display:flex;gap:.5rem;align-items:center;color:var(--gray-600); }
    .state span { color:var(--success); }
    .notifications-list { display:grid;gap:.85rem; }
    .card { display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start; }
    .card.unread { border-inline-start:5px solid var(--primary); }
    .card.high.unread { border-inline-start-color: var(--danger); }
    .filters { display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem; }
    .chip { background:var(--gray-100);color:var(--gray-700);border:1px solid var(--border);border-radius:999px;padding:.4rem .9rem; }
    .chip.active { background:var(--primary-soft);color:var(--primary-text);border-color:var(--primary);font-weight:600; }
    .open-btn { background:var(--primary-soft);color:var(--primary-text);border:1px solid rgba(214,168,79,.35); }
    .load-more { display:flex;justify-content:center;margin-top:1rem; }
    h2 { margin:0 0 .35rem;font-size:1.05rem;color:var(--gray-800); }
    p { margin:0;color:var(--gray-600);line-height:1.7; }
    small { display:inline-block;margin-top:.45rem;color:var(--gray-400); }
    .card-actions { display:flex;flex-direction:column;gap:.4rem; }
    /* ✅ إصلاح: كان اللون النصي #fff ثابتًا بينما --gray-800 ينعكس بالوضع
       الداكن ليصبح فاتحًا تقريبًا (styles.scss) — فيصبح نص أبيض فوق خلفية
       فاتحة تقريبًا، أي غير مقروء عمليًا. --gray-900/--page-bg زوج متعاكس
       بشكل صحيح بكلا الوضعين (نفس منطق body { background: var(--page-bg);
       color: var(--gray-800); } بملف styles.scss، لكن معكوسًا لأن خلفية هذا
       الزر داكنة بالوضع الفاتح). */
    button { border:0;background:var(--gray-900);color:var(--page-bg);border-radius:10px;padding:.6rem 1rem;cursor:pointer;white-space:nowrap; }
    button:disabled { background:var(--gray-300);color:var(--gray-600); }
    .dismiss-btn { background:var(--gray-100);color:var(--gray-600); }
    .dismiss-btn:hover:not(:disabled) { background:var(--gray-200); }
    .state-card.error { display:flex;align-items:center;gap:.75rem;color:var(--danger);background:var(--danger-soft);border-color:rgba(220,38,38,.2); }
    .state-card p { flex:1;color:inherit; }
    /* --danger لا يُعاد تعريفه بالوضع الداكن (يبقى نفس الأحمر بكلا الوضعين)،
       فنصه يبقى أبيض ثابتًا بدل وراثة color:var(--page-bg) من قاعدة button
       العامة أعلاه (والتي تعكس نفسها حسب الوضع ولا تناسب خلفية ثابتة اللون). */
    .state-card button { background:var(--danger);color:#fff; }
    /* ✅ إضافة: أزرار تأكيد/رفض/موعد بديل + نموذج اقتراح الموعد المصغّر */
    .visit-actions { margin-top:.75rem;display:grid;gap:.5rem; }
    .visit-actions__row { display:flex;flex-wrap:wrap;gap:.5rem; }
    .visit-actions__row button { flex:1 1 auto; }
    .confirm-btn { background:var(--success-soft);color:var(--success);border:1px solid rgba(22,163,74,.35); }
    .confirm-btn:hover:not(:disabled) { background:rgba(22,163,74,.24); }
    .decline-btn { background:var(--danger-soft);color:var(--danger);border:1px solid rgba(220,38,38,.35); }
    .decline-btn:hover:not(:disabled) { background:rgba(220,38,38,.24); }
    .propose-form { display:grid;gap:.5rem;padding:.75rem;border-radius:10px;background:var(--gray-50);border:1px solid var(--border); }
    .propose-form input,.propose-form textarea { border:1px solid var(--border);border-radius:8px;padding:.5rem;background:var(--surface);color:var(--gray-800);font:inherit;resize:vertical; }
    .propose-form input { flex:1 1 auto; }
    @media (max-width: 640px) { .card { grid-template-columns:1fr; } .card-actions { flex-direction:row; } button { width:100%; } }
  `]
})
export class NotificationsPage implements OnDestroy {
  readonly notificationsApi = inject(NotificationsApiService);
  private readonly visits = inject(VisitService);
  private readonly toast = inject(ToastService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private static readonly PageSize = 20;
  private readonly subscriptions = new Subscription();

  // ✅ إصلاح L-2: النوع المحدد بدلاً من any[]
  // TypeScript سيكتشف الآن أي خطأ في الوصول لحقل غير موجود
  readonly notifications = signal<NotificationItem[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly markingAll = signal(false);
  readonly dismissingId = signal<string | null>(null);

  // ✅ إضافة: id الإشعار الجاري تنفيذ إجراء زيارة عليه (تأكيد/رفض/قبول أو
  // رفض موعد بديل) — يمنع النقر المزدوج ويعطّل الأزرار أثناء الطلب.
  readonly respondingId = signal<string | null>(null);
  // ✅ إضافة: id الإشعار الذي يعرض حالياً نموذج "اقتراح موعد بديل" المصغّر.
  readonly proposingId = signal<string | null>(null);
  /** أقل تاريخ مسموح باختياره — اليوم (منعًا لاختيار تاريخ ماضٍ من التقويم). */
  readonly minProposeDateAttr = new Date().toISOString().slice(0, 10);

  readonly hasUnread = computed(() => this.notifications().some(n => !n.isRead));

  readonly filter = signal<string>('all');
  readonly page = signal(1);
  readonly hasMore = signal(false);
  readonly loadingMore = signal(false);

  /** Categories present in what is loaded, in first-seen order. */
  readonly categories = computed(() => {
    const seen: string[] = [];
    for (const n of this.notifications()) {
      if (n.category && !seen.includes(n.category)) seen.push(n.category);
    }
    return seen;
  });

  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.notifications() : this.notifications().filter(n => n.category === f);
  });

  constructor() {
    this.load();
    this.notificationsApi.connect();

    // الاشتراك في الإشعارات الفورية من SignalR
    this.subscriptions.add(
      this.notificationsApi.realtime$.subscribe(rawNotification => {
        // ✅ تحويل آمن من Backend format إلى NotificationItem
        const notification = toNotificationItem(rawNotification);
        // The toast is shown once, app-wide, by AppComponent; this page only updates its list.
        this.notifications.update(items =>
          items.some(n => n.id === notification.id) ? items : [notification, ...items]);
        // الدفع الفوري يحمل النص المخزَّن (العربي) لأن لغة المستلم مجهولة وقت الإرسال؛ القائمة
        // التي يعيدها الخادم تُكتب بلغة الموقع، فنحدّثها بصمت ليظهر الإشعار بلغة المستخدم.
        this.refreshSilently();
      })
    );

    // تغيير لغة الموقع: أعد جلب القائمة لتُكتب الإشعارات باللغة الجديدة (القيمة الأولى تُتجاهل
    // لأن load() أعلاه جلبتها أصلًا).
    // Read elsewhere (another tab or device): reflect it here without a reload.
    this.subscriptions.add(
      this.notificationsApi.readSync$.subscribe(sync =>
        this.notifications.update(items =>
          items.map(n => (sync.all || sync.ids?.includes(n.id) ? { ...n, isRead: true } : n))))
    );

    // The live connection came back after a drop: pick up what was raised meanwhile.
    this.subscriptions.add(this.notificationsApi.resync$.subscribe(() => this.refreshSilently()));

    this.subscriptions.add(
      this.languageService.currentLang$.pipe(skip(1)).subscribe(() => this.refreshSilently())
    );
  }

  /** إعادة جلب القائمة بلا مؤشر تحميل ولا رسالة خطأ — فشلها يُبقي ما هو معروض. */
  private refreshSilently(): void {
    this.notificationsApi.getNotifications(1, NotificationsPage.PageSize).subscribe({
      next: (items: unknown[]) => {
        const fresh = (items ?? []).map(toNotificationItem);
        const freshIds = new Set(fresh.map(n => n.id));
        // Keep older pages that were loaded with "load more"; the first page is replaced.
        this.notifications.update(existing => [...fresh, ...existing.filter(n => !freshIds.has(n.id) && this.isOlderThan(n, fresh))]);
      },
      error: () => undefined
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.page.set(1);
    this.notificationsApi.getNotifications(1, NotificationsPage.PageSize).subscribe({
      next: (items: unknown[]) => {
        const typed: NotificationItem[] = (items ?? []).map(toNotificationItem);
        this.notifications.set(typed);
        this.hasMore.set(typed.length >= NotificationsPage.PageSize);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('NOTIFICATIONS.LOAD_ERROR'));
        this.loading.set(false);
      }
    });
  }

  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    const next = this.page() + 1;

    this.notificationsApi.getNotifications(next, NotificationsPage.PageSize).subscribe({
      next: (items: unknown[]) => {
        const more: NotificationItem[] = (items ?? []).map(toNotificationItem);
        this.notifications.update(existing => {
          const ids = new Set(existing.map(n => n.id));
          return [...existing, ...more.filter(n => !ids.has(n.id))];
        });
        this.page.set(next);
        this.hasMore.set(more.length >= NotificationsPage.PageSize);
        this.loadingMore.set(false);
      },
      error: () => {
        this.toast.error(this.translate.instant('NOTIFICATIONS.LOAD_ERROR'));
        this.loadingMore.set(false);
      }
    });
  }

  private isOlderThan(item: NotificationItem, fresh: NotificationItem[]): boolean {
    const oldestFresh = fresh[fresh.length - 1]?.createdAt;
    return !oldestFresh || !item.createdAt || item.createdAt < oldestFresh;
  }

  routeOf(item: NotificationItem): string[] | null {
    return routeForNotification(item);
  }

  /** Opens the screen the notification is about; reading it is implied. The screen re-checks access. */
  open(item: NotificationItem): void {
    const route = routeForNotification(item);
    if (!route) return;
    this.markAsRead(item);
    void this.router.navigate(route);
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
      error: () => this.toast.error(this.translate.instant('NOTIFICATIONS.MARK_READ_ERROR'))
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
        this.toast.error(this.translate.instant('NOTIFICATIONS.MARK_ALL_ERROR'));
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
        this.toast.error(this.translate.instant('NOTIFICATIONS.DISMISS_ERROR'));
        this.dismissingId.set(null);
      }
    });
  }

  // ── إجراءات طلب الزيارة مباشرة من بطاقة الإشعار ─────────────────────────
  // ✅ إضافة: كانت بطاقة إشعار "طلب زيارة جديد" تتيح فقط تحديد كمقروء أو
  // تجاهل — لا تأكيد، لا رفض، ولا اقتراح موعد بديل. الأزرار أدناه تستدعي
  // VisitService مباشرة بمعرف الزيارة (notification.relatedEntityId).

  confirmVisit(notification: NotificationItem): void {
    const visitId = notification.relatedEntityId;
    if (!visitId || this.respondingId()) return;

    this.respondingId.set(notification.id);
    this.visits.confirmVisit(visitId).subscribe({
      next: () => this.onVisitActionSuccess(notification, 'تم تأكيد الزيارة.'),
      error: () => this.onVisitActionError()
    });
  }

  declineVisit(notification: NotificationItem): void {
    const visitId = notification.relatedEntityId;
    if (!visitId || this.respondingId()) return;

    this.respondingId.set(notification.id);
    this.visits.declineVisit(visitId).subscribe({
      next: () => this.onVisitActionSuccess(notification, 'تم رفض الزيارة.'),
      error: () => this.onVisitActionError()
    });
  }

  toggleProposeForm(notification: NotificationItem): void {
    this.proposingId.update(current => (current === notification.id ? null : notification.id));
  }

  cancelProposeForm(): void {
    this.proposingId.set(null);
  }

  submitPropose(notification: NotificationItem, date: string, time: string, note: string): void {
    const visitId = notification.relatedEntityId;
    if (!visitId || this.respondingId()) return;

    if (!date || !time) {
      this.toast.error('الرجاء اختيار التاريخ والوقت للموعد البديل.');
      return;
    }

    // ✅ نفس أسلوب دمج التاريخ/الوقت المستخدم بنموذج طلب الزيارة الأصلي
    // (property-detail.page.ts → submitVisit()) — تاريخ ووقت منفصلان
    // يُدمَجان بصيغة ISO 8601 فقط عند الإرسال الفعلي للـ API.
    const proposedAt = new Date(`${date}T${time}:00`).toISOString();

    this.respondingId.set(notification.id);
    this.visits.proposeAlternate(visitId, proposedAt, note || null).subscribe({
      next: () => {
        this.proposingId.set(null);
        this.onVisitActionSuccess(notification, 'تم إرسال الموعد البديل للزائر.');
      },
      error: () => this.onVisitActionError()
    });
  }

  acceptReschedule(notification: NotificationItem): void {
    const visitId = notification.relatedEntityId;
    if (!visitId || this.respondingId()) return;

    this.respondingId.set(notification.id);
    this.visits.acceptReschedule(visitId).subscribe({
      next: () => this.onVisitActionSuccess(notification, 'تم قبول الموعد البديل.'),
      error: () => this.onVisitActionError()
    });
  }

  declineReschedule(notification: NotificationItem): void {
    const visitId = notification.relatedEntityId;
    if (!visitId || this.respondingId()) return;

    this.respondingId.set(notification.id);
    this.visits.declineReschedule(visitId).subscribe({
      next: () => this.onVisitActionSuccess(notification, 'تم رفض الموعد البديل.'),
      error: () => this.onVisitActionError()
    });
  }

  private onVisitActionSuccess(notification: NotificationItem, message: string): void {
    this.respondingId.set(null);
    this.toast.success(message);

    // علّم الإشعار كمقروء محلياً — التصرف بالطلب (تأكيد/رفض/...) دلالة
    // كافية على أن المعلن/الزائر تعامل معه، ونُبقي الاستدعاء الفعلي
    // لتعليمه كمقروء بالخادم إن لم يكن قد قُرئ بعد.
    const wasUnread = !notification.isRead;
    this.notifications.update(items =>
      items.map(n => (n.id === notification.id ? { ...n, isRead: true } : n))
    );

    if (wasUnread && notification.id) {
      this.notificationsApi.markAsRead(notification.id).subscribe();
    }
  }

  private onVisitActionError(): void {
    this.respondingId.set(null);
    this.toast.error('تعذّر تنفيذ الإجراء. حاول مرة أخرى.');
  }
}