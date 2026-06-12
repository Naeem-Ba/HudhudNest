import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { NotificationsApiService } from '../../core/services/notifications-api.service';

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page" dir="rtl">
      <h1>&#1575;&#1604;&#1573;&#1588;&#1593;&#1575;&#1585;&#1575;&#1578;</h1>

      <p class="state">
        &#1581;&#1575;&#1604;&#1577; &#1575;&#1604;&#1575;&#1578;&#1589;&#1575;&#1604;: {{ notificationsApi.connectionState() }}
      </p>

      <p class="error" *ngIf="error()">{{ error() }}</p>
      <p class="loading" *ngIf="loading()">&#1580;&#1575;&#1585;&#1613; &#1575;&#1604;&#1578;&#1581;&#1605;&#1610;&#1604;...</p>

      <div class="empty" *ngIf="!loading() && notifications().length === 0 && !error()">
        &#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1573;&#1588;&#1593;&#1575;&#1585;&#1575;&#1578; &#1581;&#1575;&#1604;&#1610;&#1611;&#1575;.
      </div>

      <article class="card" *ngFor="let notification of notifications()">
        <h2>{{ getTitle(notification) }}</h2>
        <p>{{ getBody(notification) }}</p>
        <button type="button" (click)="markAsRead(notification)">
          &#1578;&#1593;&#1604;&#1610;&#1605; &#1603;&#1605;&#1602;&#1585;&#1608;&#1569;
        </button>
      </article>
    </section>
  `,
  styles: [`
    .page{padding:2rem}
    .card,.empty,.loading,.error,.state{background:#fff;padding:1rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.06);margin-bottom:1rem}
    .error{color:#b00020}
    button{border:0;background:#1e3a5f;color:#fff;border-radius:8px;padding:.5rem 1rem;cursor:pointer}
  `]
})
export class NotificationsPage {
  readonly notificationsApi = inject(NotificationsApiService);

  readonly notifications = signal<any[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  constructor() {
    this.load();
    this.notificationsApi.connect();

    this.notificationsApi.realtime$.subscribe(notification => {
      this.notifications.update(items => [notification, ...items]);
    });
  }

  getTitle(item: any): string {
    return String(item?.title ?? item?.Title ?? '\u0625\u0634\u0639\u0627\u0631');
  }

  getBody(item: any): string {
    return String(item?.body ?? item?.Body ?? item?.message ?? item?.Message ?? '-');
  }

  markAsRead(item: any): void {
    const id = item?.id ?? item?.Id;
    if (!id) return;

    this.notificationsApi.markAsRead(String(id)).subscribe({
      next: () => {
        item.isRead = true;
        item.IsRead = true;
      }
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    this.notificationsApi.getNotifications().subscribe({
      next: items => {
        this.notifications.set(items as any[]);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('\u064A\u062C\u0628 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0644\u0639\u0631\u0636 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A.');
        this.loading.set(false);
      }
    });
  }
}
