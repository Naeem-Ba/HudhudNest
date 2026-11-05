import {
  ChangeDetectionStrategy, Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, computed, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ServiceRequestService } from '../../core/api/service-request.service';
import {
  SERVICE_MESSAGE_MAX_LENGTH,
  ServiceRequestDto,
  ServiceRequestMessageDto,
  canExchangeMessages
} from '../../core/models/service.model';
import { ToastService } from '../../shared/services/toast.service';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

export type ServiceConversationRole = 'requester' | 'provider' | 'admin';

/** What the parent page needs to keep its own card (badge, confirm button) in step with the thread. */
export interface ServiceConversationActivity {
  requestId: string;
  messageCount: number;
  unreadMessageCount: number;
  lastMessageAt: string | null;
}

/**
 * The in-app conversation between the customer and the provider of one service request.
 * Customer and provider see the same thread; an admin sees it read-only. The customer can turn
 * an inquiry into a real request from here once they have written to the provider. The parent decides the
 * role: a page that lists the viewer's own requests passes 'requester', so the component needs no identity.
 */
@Component({
  selector: 'app-service-conversation',
  standalone: true,
  imports: [ LocalizedDatePipe,CommonModule, FormsModule, TranslateModule],
  templateUrl: './service-conversation.component.html',
  styleUrls: ['./service-conversation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServiceConversationComponent implements OnInit, OnChanges {
  private readonly api = inject(ServiceRequestService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  @Input({ required: true }) request!: ServiceRequestDto;
  @Input() role: ServiceConversationRole = 'requester';
  /** The admin detail already carries the thread; no extra call is made when it is given. */
  @Input() preloaded: ServiceRequestMessageDto[] | null = null;
  /** Refresh interval while the thread is open. 0 turns polling off (tests, admin). */
  @Input() pollMs = 20000;

  /** The inquiry became a request (the customer pressed confirm). */
  @Output() requestChange = new EventEmitter<ServiceRequestDto>();
  @Output() activity = new EventEmitter<ServiceConversationActivity>();

  readonly maxLength = SERVICE_MESSAGE_MAX_LENGTH;
  readonly messages = signal<ServiceRequestMessageDto[]>([]);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly confirming = signal(false);

  readonly canWrite = computed(() =>
    this.role !== 'admin' && canExchangeMessages(this.request.status));

  readonly canConfirm = computed(() =>
    this.role === 'requester'
    && this.request.status === 'Inquiry'
    && this.messages().length > 0);

  readonly canSend = computed(() => {
    const body = this.draft().trim();
    return this.canWrite() && !this.sending() && body.length > 0 && body.length <= this.maxLength;
  });

  /** The line that explains the stage the request is in, for this side. */
  readonly hintKey = computed(() => {
    const status = this.request.status;
    if (status === 'Expired') return 'SERVICE_CONVERSATION.HINT_EXPIRED';
    if (!canExchangeMessages(status)) return 'SERVICE_CONVERSATION.HINT_CLOSED';
    if (status === 'Inquiry') {
      return this.role === 'provider'
        ? 'SERVICE_CONVERSATION.HINT_INQUIRY_PROVIDER'
        : 'SERVICE_CONVERSATION.HINT_INQUIRY_REQUESTER';
    }
    return '';
  });

  ngOnInit(): void {
    this.refresh();
    if (this.pollMs > 0 && this.role !== 'admin' && !this.preloaded) {
      interval(this.pollMs)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (this.canWrite() && !this.sending() && !this.isHidden()) this.refresh(true);
        });
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const previous = changes['request']?.previousValue as ServiceRequestDto | undefined;
    if (previous && previous.id !== this.request.id) this.refresh();
  }

  refresh(silent = false): void {
    if (this.preloaded) {
      this.messages.set(this.preloaded);
      return;
    }
    if (!silent) this.loading.set(true);
    this.loadFailed.set(false);
    this.api.getMessages(this.request.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: items => {
          const changed = items.length !== this.messages().length;
          this.messages.set(items);
          this.loading.set(false);
          this.afterLoad(items, changed || !silent);
        },
        error: () => {
          this.loading.set(false);
          if (!silent) this.loadFailed.set(true);
        }
      });
  }

  private afterLoad(items: ServiceRequestMessageDto[], notify: boolean): void {
    const hasUnread = this.role !== 'admin' && items.some(item => !item.isMine && !item.readAt);
    if (hasUnread) {
      this.api.markMessagesRead(this.request.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ error: () => undefined });
    }
    if (notify) this.emitActivity(items, 0);
  }

  private emitActivity(items: ServiceRequestMessageDto[], unread: number): void {
    this.activity.emit({
      requestId: this.request.id,
      messageCount: items.length,
      unreadMessageCount: unread,
      lastMessageAt: items.at(-1)?.createdAt ?? null
    });
  }

  send(): void {
    if (!this.canSend()) return;
    const body = this.draft().trim();
    this.sending.set(true);
    this.api.sendMessage(this.request.id, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: message => {
          const items = [...this.messages(), message];
          this.messages.set(items);
          this.draft.set('');
          this.sending.set(false);
          this.emitActivity(items, 0);
        },
        error: () => {
          this.sending.set(false);
          this.toast.show(this.translate.instant('SERVICE_CONVERSATION.SEND_ERROR'), 'error');
        }
      });
  }

  confirm(): void {
    if (!this.canConfirm() || this.confirming()) return;
    this.confirming.set(true);
    this.api.confirm(this.request.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: updated => {
          this.confirming.set(false);
          this.toast.show(this.translate.instant('SERVICE_CONVERSATION.CONFIRM_SUCCESS'), 'success');
          this.requestChange.emit(updated);
        },
        error: () => {
          this.confirming.set(false);
          this.toast.show(this.translate.instant('SERVICE_CONVERSATION.CONFIRM_ERROR'), 'error');
        }
      });
  }

  onDraft(value: string): void { this.draft.set(value); }

  trackById(_: number, item: ServiceRequestMessageDto): string { return item.id; }

  private isHidden(): boolean {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }
}
