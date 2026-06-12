import { Injectable, OnDestroy } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStorageService } from './token-storage.service';

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
  private connection?: signalR.HubConnection;
  private readonly notificationsSubject = new BehaviorSubject<RealtimeNotification[]>([]);
  private readonly connectionStateSubject = new BehaviorSubject<string>('disconnected');

  readonly notifications$: Observable<RealtimeNotification[]> = this.notificationsSubject.asObservable();
  readonly connectionState$: Observable<string> = this.connectionStateSubject.asObservable();

  constructor(private readonly tokenStorage: TokenStorageService) {}

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    const token = this.tokenStorage.getAccessToken();

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.signalRUrl, {
        accessTokenFactory: () => token ?? ''
      })
      .withAutomaticReconnect()
      .build();

    this.connection.on('ReceiveNotification', (notification: RealtimeNotification) => {
      const current = this.notificationsSubject.value;
      this.notificationsSubject.next([notification, ...current]);
    });

    this.connection.onreconnecting(() => {
      this.connectionStateSubject.next('reconnecting');
    });

    this.connection.onreconnected(() => {
      this.connectionStateSubject.next('connected');
    });

    this.connection.onclose(() => {
      this.connectionStateSubject.next('disconnected');
    });

    try {
      this.connectionStateSubject.next('connecting');
      await this.connection.start();
      this.connectionStateSubject.next('connected');
    } catch (error) {
      this.connectionStateSubject.next('error');
      console.warn('SignalR connection failed', error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connection) {
      return;
    }

    await this.connection.stop();
    this.connectionStateSubject.next('disconnected');
  }

  pushLocal(notification: RealtimeNotification): void {
    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([notification, ...current]);
  }

  ngOnDestroy(): void {
    void this.disconnect();
  }
}
