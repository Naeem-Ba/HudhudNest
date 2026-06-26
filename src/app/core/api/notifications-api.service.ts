// src/app/core/services/notifications-api.service.ts
//
// ❌ المشاكل:
//   1. SignalR: الـ token يُلتقط مرة واحدة عند الاتصال (static capture)
//      → عند تجديد الـ accessToken لن يصل الـ token الجديد للـ hub عند reconnect
//   2. مفقود: event "UnreadCountChanged" من الـ Backend (مواصفات قسم 7.2)
//   3. مفقود: دالة markAllAsRead() (PATCH /notifications/read-all)
//   4. مفقود: دالة softDelete() (PATCH /notifications/{id}/soft-delete)
//   5. مفقود: دالة invokeMarkRead() للـ SignalR (مواصفات قسم 7.3)
//
// ✅ الإصلاح: إضافة العناصر المفقودة + إصلاح الـ token.

import { Injectable, NgZone, signal } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { NotificationItem, toNotificationItem } from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private hub?: signalR.HubConnection;
  private readonly realtimeSubject = new Subject<NotificationItem>();

  readonly realtime$ = this.realtimeSubject.asObservable();
  readonly unreadCount = signal(0);
  readonly connectionState = signal<'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'>('disconnected');

  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService,
    private readonly zone: NgZone
  ) {}

  // ── HTTP endpoints ────────────────────────────────────────────────────────

  getNotifications(page = 1, pageSize = 20): Observable<NotificationItem[]> {
    return this.api
      .get<NotificationItem[] | ApiPagedResult<NotificationItem>>(
        '/notifications',
        { page, pageSize }
      )
      .pipe(
        map(response =>
          unwrapItems(response).map(item => toNotificationItem(item))
        )
      );
  }

  getUnreadCount(): Observable<number> {
    return this.api
      .get<number | { count?: number; Count?: number }>('/notifications/unread-count')
      .pipe(
        map(response =>
          typeof response === 'number'
            ? response
            : (response.count ?? response.Count ?? 0)
        )
      );
  }

  markAsRead(id: string): Observable<unknown> {
    return this.api.patch(`/notifications/${id}/read`);
  }

  // ✅ إضافة: تعليم كل الإشعارات كمقروءة (PATCH /notifications/read-all)
  markAllAsRead(): Observable<unknown> {
    return this.api.patch('/notifications/read-all');
  }

  // ✅ إضافة: حذف منطقي (PATCH /notifications/{id}/soft-delete)
  softDelete(id: string): Observable<unknown> {
    return this.api.patch(`/notifications/${id}/soft-delete`);
  }

  // ── SignalR ───────────────────────────────────────────────────────────────

  connect(): void {
    if (this.hub) {
      return;
    }

    const hubUrl =
      environment.signalRUrl ||
      `${(environment.baseUrl || environment.apiUrl.replace(/\/api\/?$/, '')).replace(/\/$/, '')}/notificationHub`;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        // ✅ إصلاح: callback ديناميكي بدلاً من قيمة ثابتة
        // يُستدعى في كل reconnect → يُرسل التوكن الحالي دائماً
        accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? ''
      })
      .withAutomaticReconnect()
      .build();

    // ✅ إشعار جديد وصل
    this.hub.on('ReceiveNotification', notification => {
      this.zone.run(() => {
        this.realtimeSubject.next(toNotificationItem(notification));
        this.unreadCount.update(value => value + 1);
      });
    });

    // ✅ إصلاح: تحديث عداد الإشعارات غير المقروءة عبر SignalR (مواصفات قسم 7.2)
    this.hub.on('UnreadCountChanged', (count: number) => {
      this.zone.run(() => {
        this.unreadCount.set(count);
      });
    });

    this.hub.onreconnecting(() => {
      this.zone.run(() => this.connectionState.set('reconnecting'));
    });

    this.hub.onreconnected(() => {
      this.zone.run(() => this.connectionState.set('connected'));
    });

    this.hub.onclose(() => {
      this.zone.run(() => this.connectionState.set('disconnected'));
      this.hub = undefined;
    });

    this.connectionState.set('connecting');

    this.hub.start()
      .then(() => this.zone.run(() => this.connectionState.set('connected')))
      .catch(error => {
        this.zone.run(() => this.connectionState.set('error'));
        console.warn('SignalR connection failed', error);
        this.hub = undefined;
      });
  }

  // ✅ إضافة: إعلام الـ Backend بقراءة إشعار عبر SignalR (مواصفات قسم 7.3)
  // الـ Backend يرد بإرسال "UnreadCountChanged" للعميل
  async invokeMarkRead(notificationId: string): Promise<void> {
    if (this.hub?.state === signalR.HubConnectionState.Connected) {
      await this.hub.invoke('MarkNotificationRead', notificationId);
    } else {
      // Fallback: HTTP إذا لم يكن SignalR متصلاً
      this.markAsRead(notificationId).subscribe();
    }
  }

  disconnect(): void {
    this.hub?.stop();
    this.hub = undefined;
    this.connectionState.set('disconnected');
  }
}