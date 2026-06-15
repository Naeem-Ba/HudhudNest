import { CommonModule } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { NotificationsApiService } from '../../core/services/notifications-api.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { ToastService } from '../../shared/services/toast.service';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule, TranslateModule, EmptyStateComponent, LoadingSpinnerComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'NOTIFICATIONS.TITLE' | translate }}</h1>
        <p>{{ 'NOTIFICATIONS.SUBTITLE' | translate }}</p>
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
        <article class="card" *ngFor="let notification of notifications(); trackBy: trackById" [class.unread]="!isRead(notification)">
          <div>
            <h2 class="line-clamp-2">{{ getTitle(notification) }}</h2>
            <p class="line-clamp-3">{{ getBody(notification) }}</p>
            <small *ngIf="getDate(notification)">{{ getDate(notification) | date:'short' }}</small>
          </div>

          <button type="button" [disabled]="isRead(notification)" (click)="markAsRead(notification)">
            {{ isRead(notification) ? ('NOTIFICATIONS.READ' | translate) : ('NOTIFICATIONS.MARK_READ' | translate) }}
          </button>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); }
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin:0 0 .35rem;font-size:clamp(1.6rem,3vw,2.2rem); }
    .page-header p { margin:0;color:#64748b;line-height:1.7; }
    .state,.card,.state-card { background:#fff;padding:1rem;border-radius:16px;box-shadow:0 12px 30px rgba(15,23,42,.08);border:1px solid #e2e8f0;margin-bottom:1rem; }
    .state { display:flex;gap:.5rem;align-items:center;color:#475569; }
    .state span { color:#16a34a; }
    .notifications-list { display:grid;gap:.85rem; }
    .card { display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:start; }
    .card.unread { border-inline-start:5px solid #2563eb; }
    h2 { margin:0 0 .35rem;font-size:1.05rem; }
    p { margin:0;color:#475569;line-height:1.7; }
    small { display:inline-block;margin-top:.45rem;color:#94a3b8; }
    button { border:0;background:#1e3a5f;color:#fff;border-radius:10px;padding:.6rem 1rem;cursor:pointer;white-space:nowrap; }
    button:disabled { background:#cbd5e1;color:#475569; }
    .state-card.error { display:flex;align-items:center;gap:.75rem;color:#b91c1c;background:#fff7f7;border-color:#fecaca; }
    .state-card p { flex:1;color:inherit; }
    .state-card button { background:#dc2626; }
    @media (max-width: 640px) { .card { grid-template-columns:1fr; } button { width:100%; } }
  `]
})
export class NotificationsPage implements OnDestroy {
  readonly notificationsApi = inject(NotificationsApiService);
  private readonly toast = inject(ToastService);
  private readonly subscriptions = new Subscription();

  readonly notifications = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.load();
    this.notificationsApi.connect();

    this.subscriptions.add(
      this.notificationsApi.realtime$.subscribe(notification => {
        this.notifications.update(items => [notification, ...items]);
        this.toast.info(this.getTitle(notification), 'إشعار جديد');
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
      next: items => {
        this.notifications.set(items as any[] ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('يجب تسجيل الدخول لعرض الإشعارات أو تعذر تحميل البيانات.');
        this.loading.set(false);
      }
    });
  }

  trackById(index: number, item: any): string {
    return String(item?.id ?? item?.Id ?? index);
  }

  getTitle(item: any): string {
    return String(item?.title ?? item?.Title ?? 'إشعار');
  }

  getBody(item: any): string {
    return String(item?.body ?? item?.Body ?? item?.message ?? item?.Message ?? 'لا توجد تفاصيل إضافية.');
  }

  getDate(item: any): string | null {
    return item?.createdAt ?? item?.CreatedAt ?? null;
  }

  isRead(item: any): boolean {
    return !!(item?.isRead ?? item?.IsRead);
  }

  markAsRead(item: any): void {
    const id = item?.id ?? item?.Id;
    if (!id || this.isRead(item)) return;

    this.notificationsApi.markAsRead(String(id)).subscribe({
      next: () => {
        item.isRead = true;
        item.IsRead = true;
        this.notifications.update(items => [...items]);
      },
      error: () => this.toast.error('تعذر تعليم الإشعار كمقروء.')
    });
  }
}
