import { Injectable, NgZone, signal } from '@angular/core';
import { Observable, Subject, map } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { BackendApiService } from './backend-api.service';
import { TokenStorageService } from './token-storage.service';
import { ApiPagedResult, unwrapItems } from '../models/api.model';
import { NotificationItem } from '../models/notification.model';

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

  getNotifications(): Observable<NotificationItem[]> {
    return this.api
      .get<NotificationItem[] | ApiPagedResult<NotificationItem>>('/notifications')
      .pipe(map(response => unwrapItems(response)));
  }

  getUnreadCount(): Observable<number> {
    return this.api
      .get<number | { count?: number; Count?: number }>('/notifications/unread-count')
      .pipe(map(response => typeof response === 'number' ? response : (response.count ?? response.Count ?? 0)));
  }

  markAsRead(id: string): Observable<unknown> {
    return this.api.patch(`/notifications/${id}/read`);
  }

  connect(): void {
    if (this.hub) {
      return;
    }

    const hubUrl =
      environment.signalRUrl ||
      `${(environment.baseUrl || environment.apiUrl.replace(/\/api\/?$/, '')).replace(/\/$/, '')}/notificationHub`;

    this.hub = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => this.tokenStorage.getAccessToken() ?? ''
      })
      .withAutomaticReconnect()
      .build();

    this.hub.on('ReceiveNotification', notification => {
      this.zone.run(() => {
        this.realtimeSubject.next(notification as NotificationItem);
        this.unreadCount.update(value => value + 1);
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

  disconnect(): void {
    this.hub?.stop();
    this.hub = undefined;
    this.connectionState.set('disconnected');
  }
}