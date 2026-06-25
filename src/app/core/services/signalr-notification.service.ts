// ═══════════════════════════════════════════════════════════════
// ✅ إصلاحان في هذا الملف:
//
// إصلاح L-1 (SignalR accessTokenFactory):
//   المشكلة: كانت قيمة الـ Token تُلتقط مرة واحدة عند connect()
//   مما يجعلها قديمة بعد تجديد الـ Access Token.
//
//   الإصلاح: Arrow function تقرأ getAccessToken() عند كل reconnect
//   بدلاً من قيمة محفوظة سابقاً.
//
// إصلاح L-5 (تحديد حجم الـ notifications list):
//   المشكلة: الإشعارات تتراكم في memory بلا حد أقصى.
//   الإصلاح: الاحتفاظ بآخر MAX_NOTIFICATIONS فقط.
//
// التعليم — لماذا Arrow Function؟
//   const token = this.tokenStorage.getAccessToken();  ← ❌ يُحفَظ الآن
//   accessTokenFactory: () => token ?? ''              ← ❌ يُرجع القيمة المحفوظة دائماً
//
//   accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? ''  ← ✅
//   هذه Arrow Function تُستدعى عند كل reconnect وتقرأ القيمة الحالية.
//   الـ closure يحتفظ بـ reference لـ this.tokenStorage، لا بـ token value.
// ═══════════════════════════════════════════════════════════════
import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from './token-storage.service';

/** شكل الإشعار الفوري القادم من SignalR */
export interface RealtimeNotification {
  id?: string;
  title?: string;
  body?: string;
  message?: string;
  type?: string;
  isRead?: boolean;
  createdAt?: string;
}

@Injectable({ providedIn: 'root' })
export class SignalrNotificationService implements OnDestroy {

  /** ✅ إصلاح L-5: تحديد حد أقصى للإشعارات في الذاكرة */
  private static readonly MAX_NOTIFICATIONS = 50;

  private connection?: signalR.HubConnection;

  private readonly notificationsSubject = new BehaviorSubject<RealtimeNotification[]>([]);
  private readonly connectionStateSubject = new BehaviorSubject<string>('disconnected');

  readonly notifications$: Observable<RealtimeNotification[]> = this.notificationsSubject.asObservable();
  readonly connectionState$: Observable<string> = this.connectionStateSubject.asObservable();

  constructor(private readonly tokenStorage: TokenStorageService) {}

  async connect(): Promise<void> {
    // لا تُنشئ اتصالاً جديداً إذا كان الاتصال قائماً
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    // ✅ إصلاح L-1: لا تُخزِّن token في متغير محلي!
    //
    // ❌ الكود القديم (خطأ):
    //   const token = this.tokenStorage.getAccessToken(); // يُلتقط مرة واحدة
    //   accessTokenFactory: () => token ?? ''             // يُرجع القيمة القديمة دائماً
    //
    // ✅ الكود الجديد (صحيح):
    //   accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? ''
    //   Arrow Function تُستدعى عند كل reconnect وتقرأ القيمة الحالية من الذاكرة.
    //
    // السيناريو المُصلَح:
    //   1. المستخدم يفتح التطبيق → يتصل بـ SignalR بـ Token A
    //   2. بعد 15 دقيقة → Refresh Interceptor يجدد الـ Token → Token B
    //   3. SignalR يُعيد الاتصال → يستدعي accessTokenFactory → يقرأ Token B ✅
    //   (بالكود القديم كان يرسل Token A المنتهي الصلاحية ❌)
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.signalRUrl, {
        accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? '' // ✅ إصلاح L-1
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000]) // إعادة المحاولة بفترات متزايدة
      .build();

    // معالجة الإشعارات الواردة
    this.connection.on('ReceiveNotification', (notification: RealtimeNotification) => {
      const current = this.notificationsSubject.value;

      // ✅ إصلاح L-5: احتفظ بآخر MAX_NOTIFICATIONS إشعاراً فقط
      // slice(0, MAX-1) → نأخذ أول (MAX-1) إشعار من القائمة الحالية
      // [notification, ...] → نضيف الجديد في المقدمة
      const updated = [notification, ...current].slice(0, SignalrNotificationService.MAX_NOTIFICATIONS);
      this.notificationsSubject.next(updated);
    });

    // متابعة حالة الاتصال للـ UI
    this.connection.onreconnecting(() => {
      this.connectionStateSubject.next('reconnecting');
    });

    this.connection.onreconnected(() => {
      this.connectionStateSubject.next('connected');
    });

    this.connection.onclose(() => {
      this.connectionStateSubject.next('disconnected');
    });

    // بدء الاتصال مع معالجة الأخطاء
    try {
      this.connectionStateSubject.next('connecting');
      await this.connection.start();
      this.connectionStateSubject.next('connected');
    } catch (error) {
      this.connectionStateSubject.next('error');
      // في Production: لا تُظهر console.warn مع تفاصيل الخطأ
      if (!environment.production) {
        console.warn('SignalR connection failed', error);
      }
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.stop();
    this.connectionStateSubject.next('disconnected');
  }

  /** إضافة إشعار محلياً (من أحداث غير SignalR) */
  pushLocal(notification: RealtimeNotification): void {
    const current = this.notificationsSubject.value;

    // ✅ نطبق نفس الحد الأقصى هنا أيضاً للاتساق
    const updated = [notification, ...current].slice(0, SignalrNotificationService.MAX_NOTIFICATIONS);
    this.notificationsSubject.next(updated);
  }

  /** مسح الإشعارات عند تسجيل الخروج */
  clearNotifications(): void {
    this.notificationsSubject.next([]);
  }

  ngOnDestroy(): void {
    // تنظيف الاتصال عند تدمير الـ Service
    this.connection?.stop().catch(() => {
      // تجاهل الأخطاء عند التدمير — التطبيق يُغلَق على أي حال
    });
  }
}