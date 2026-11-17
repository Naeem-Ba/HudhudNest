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

import { HttpContext } from '@angular/common/http';
import { Injectable, NgZone, signal } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
// Types only: the SignalR client (~55 kB) is loaded on the first connect(), which only happens for a
// signed-in user, instead of being part of every visitor's initial bundle.
import type * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { normalizeUtcInstants } from '../interceptors/utc-dates.interceptor';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from '../services/token-storage.service';
import { LanguageService } from '../services/language.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { NotificationItem, toNotificationItem } from '../models/notification.model';

export interface MessageReceivedEvent {
  propertyId: string;
  senderId: string;
  messageId: string;
}

/** The hub sends camelCase ids; anything else (an older server, a malformed payload) is ignored. */
export function toMessageReceivedEvent(payload: unknown): MessageReceivedEvent | null {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const propertyId = raw['propertyId'] ?? raw['PropertyId'];
  const senderId = raw['senderId'] ?? raw['SenderId'];
  const messageId = raw['messageId'] ?? raw['MessageId'];
  if (typeof propertyId !== 'string' || typeof senderId !== 'string' || typeof messageId !== 'string') {
    return null;
  }
  return { propertyId, senderId, messageId };
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private hub?: signalR.HubConnection;
  /** Set while the client library loads, so a second connect() in that window does not build a second hub. */
  private connecting = false;
  private readonly realtimeSubject = new Subject<NotificationItem>();

  readonly realtime$ = this.realtimeSubject.asObservable();

  /** Another tab or device marked notifications as read: ids, or all=true. */
  private readonly readSyncSubject = new Subject<{ ids: string[] | null; all: boolean }>();
  readonly readSync$ = this.readSyncSubject.asObservable();

  /**
   * QA phase 25 (P25-D02): a message just arrived for this user, whether or not it also raised a notice (notices
   * coalesce while an unread message exists, so the open conversation cannot rely on them). Ids only; the page
   * that shows the conversation re-fetches it.
   */
  private readonly messageReceivedSubject = new Subject<MessageReceivedEvent>();
  readonly messageReceived$ = this.messageReceivedSubject.asObservable();

  /** The live connection came back after a drop: anything raised meanwhile must be re-fetched. */
  private readonly resyncSubject = new Subject<void>();
  readonly resync$ = this.resyncSubject.asObservable();
  readonly unreadCount = signal(0);
  readonly connectionState = signal<'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'>('disconnected');

  constructor(
    private readonly api: BackendApiService,
    private readonly tokenStorage: TokenStorageService,
    private readonly zone: NgZone,
    private readonly languageService: LanguageService
  ) {}

  // ── HTTP endpoints ────────────────────────────────────────────────────────

  /**
   * قائمة إشعاراتي. نرسل لغة الموقع الحالية (ar | en | de) ليكتب الخادم نصوص إشعارات الرسائل
   * والاستفسارات بها؛ الأنواع الأخرى وخادم أقدم يتجاهلان المعامل ويعيدان النص المخزَّن كما هو.
   */
  getNotifications(page = 1, pageSize = 20): Observable<NotificationItem[]> {
    return this.api
      .get<NotificationItem[] | ApiPagedResult<NotificationItem>>(
        '/notifications',
        { page, pageSize, language: this.languageService.getCurrent() }
      )
      .pipe(
        map(response =>
          unwrapItems(response).map(item => toNotificationItem(item))
        )
      );
  }

  getUnreadCount(): Observable<number> {
    return this.api
      .get<number | { unreadCount?: number; UnreadCount?: number; count?: number; Count?: number }>(
        '/notifications/unread-count',
        undefined,
        // The badge is a convenience and every caller swallows a failure: no toast for it.
        { context: new HttpContext().set(SKIP_ERROR_TOAST, true) }
      )
      .pipe(
        map(response =>
          typeof response === 'number'
            ? response
            : (response.unreadCount ?? response.UnreadCount ?? response.count ?? response.Count ?? 0)
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

  // 📌 قرار معماري موثَّق (وليس نقصاً): الباك اند يوفر أيضاً
  // DELETE /notifications/{id} (حذف نهائي)، لكن الواجهة تكتفي عمداً بـ
  // softDelete أعلاه. لا يوجد سبب تقني يمنع إضافة hardDelete() هنا لاحقاً إن
  // احتاج المنتج فعلاً "حذف نهائي" من واجهة المستخدم — فقط لم يُبنَ لأنه غير
  // مطلوب حاليًا (لا زر UI يستدعيه).

  // ── SignalR ───────────────────────────────────────────────────────────────

  connect(): void {
    if (this.hub || this.connecting) {
      return;
    }

    this.connecting = true;
    this.connectionState.set('connecting');
    import('@microsoft/signalr')
      .then(signalR => {
        this.connecting = false;
        // disconnect() may have run while the library was loading.
        if (this.connectionState() === 'connecting') {
          this.startHub(signalR);
        }
      })
      .catch(error => {
        this.connecting = false;
        this.zone.run(() => this.connectionState.set('error'));
        console.warn('SignalR client failed to load', error);
      });
  }

  private startHub(signalR: typeof import('@microsoft/signalr')): void {
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
        this.realtimeSubject.next(toNotificationItem(normalizeUtcInstants(notification)));
        this.unreadCount.update(value => value + 1);
      });
    });

    this.hub.on('MessageReceived', (payload: unknown) => {
      const event = toMessageReceivedEvent(normalizeUtcInstants(payload));
      if (event) {
        this.zone.run(() => this.messageReceivedSubject.next(event));
      }
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

    this.hub.on('NotificationsRead', (payload: { ids?: string[] | null; Ids?: string[] | null; all?: boolean; All?: boolean }) => {
      this.zone.run(() => {
        this.readSyncSubject.next({
          ids: payload?.ids ?? payload?.Ids ?? null,
          all: Boolean(payload?.all ?? payload?.All)
        });
      });
    });

    this.hub.onreconnected(() => {
      this.zone.run(() => {
        this.connectionState.set('connected');
        // Notifications raised while the connection was down only exist on the server: re-sync.
        this.getUnreadCount().subscribe({ next: count => this.unreadCount.set(count), error: () => undefined });
        this.resyncSubject.next();
      });
    });

    this.hub.onclose(() => {
      this.zone.run(() => this.connectionState.set('disconnected'));
      this.hub = undefined;
    });

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
    // HubConnectionState is a string enum; comparing to its value keeps the library out of this path.
    if (this.hub?.state === ('Connected' as signalR.HubConnectionState)) {
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