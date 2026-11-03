// =============================================================
// src/app/features/messages/property-messages.page.ts
//
// محادثة خاصة بعقار واحد (المسار: /messages/:propertyId?with=userId)
//
//   - الزائر (غير المالك): يرى مباشرة محادثته الوحيدة مع مالك العقار ويرد منها.
//   - المالك: بلا ?with يرى قائمة من راسلوه بخصوص هذا العقار (مجمَّعة في
//     الخادم عبر GET /api/Messages/conversations?propertyId=)، ثم يختار محادثة
//     ليقرأها ويرد عليها. مع ?with تُفتح تلك المحادثة مباشرة (من صندوق الوارد
//     أو من إشعار).
//
// كل محادثة تُجلب من الخادم كمحادثة واحدة (otherUserId)، وتُعلَّم رسائلها
// الواردة كمقروءة عند فتحها، وتُحدَّث لحظيًا عند وصول رسالة جديدة (SignalR).
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { filter } from 'rxjs';

import { MessagesApiService } from '../../core/api/messages-api.service';
import { NotificationsApiService } from '../../core/api/notifications-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import {
  ConversationSummaryDto,
  MESSAGE_CONTENT_MAX_LENGTH,
  MESSAGES_MAX_PAGE_SIZE,
  MessageDto,
  sortChronologically,
  validateMessageContent
} from '../../core/models/message.model';
import { Property } from '../../core/models/property.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ConversationListComponent } from './conversation-list.component';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

@Component({
  selector: 'app-property-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,
    CommonModule, RouterModule, FormsModule, TranslateModule,
    LoadingSpinnerComponent, EmptyStateComponent, ConversationListComponent
  ],
  template: `
    <section class="page">
      <header class="page-header">
        <button type="button" class="back-btn" (click)="goBack()" [attr.aria-label]="'COMMON.BACK' | translate">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M11 3L5 9l6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="page-header__text">
          <h1>{{ 'MESSAGES.TITLE' | translate }}</h1>
          <a *ngIf="property() as p" class="subtitle line-clamp-1" [routerLink]="['/properties', p.id]">{{ p.title }}</a>
        </div>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state-card error" *ngIf="!loading() && error()" role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>{{ error() | translate }}</p>
      </div>

      <!-- ── وضع المالك: قائمة من راسلوه بخصوص هذا العقار ── -->
      <ng-container *ngIf="!loading() && !error() && isOwnerView() && !activeOtherUserId()">
        <app-empty-state
          *ngIf="conversations().length === 0"
          icon="💬"
          [title]="'MESSAGES.EMPTY_TITLE' | translate"
          [message]="'MESSAGES.EMPTY_OWNER_MESSAGE' | translate"
        ></app-empty-state>

        <app-conversation-list
          *ngIf="conversations().length > 0"
          [conversations]="conversations()"
          [currentUserId]="currentUserId"
          [showProperty]="false"
          (open)="openConversation($event.otherUserId)"
        ></app-conversation-list>
      </ng-container>

      <!-- ── وضع المحادثة (زائر، أو مالك اختار محادثة) ── -->
      <div class="thread" *ngIf="!loading() && !error() && (!isOwnerView() || activeOtherUserId())">
        <div class="thread-bar">
          <button type="button" class="thread-back" *ngIf="isOwnerView()" (click)="closeConversation()">
            {{ 'MESSAGES.BACK_TO_LIST' | translate }}
          </button>
          <span class="thread-with" *ngIf="counterpartName()">
            {{ 'MESSAGES.CONVERSATION_WITH' | translate: { name: counterpartName() } }}
          </span>
          <a *ngIf="counterpartProfileId() as pid" class="thread-profile-link" [routerLink]="['/users', pid]">
            {{ 'PUBLIC_PROFILE.VIEW_PROFILE_LINK' | translate }}
          </a>
        </div>

        <app-empty-state
          *ngIf="thread().length === 0"
          icon="💬"
          [title]="'MESSAGES.EMPTY_TITLE' | translate"
          [message]="'MESSAGES.EMPTY_THREAD_MESSAGE' | translate"
        ></app-empty-state>

        <p class="thread-older-hint" *ngIf="hasOlderMessages()">{{ 'MESSAGES.OLDER_HIDDEN' | translate }}</p>

        <div #threadScroller class="thread-messages" *ngIf="thread().length > 0" role="log" aria-live="polite">
          <div
            class="bubble"
            *ngFor="let message of thread(); trackBy: trackByMessageId"
            [class.bubble--mine]="message.senderId === currentUserId"
          >
            <span class="bubble__sender" *ngIf="message.senderId !== currentUserId && message.senderDisplayName">
              {{ message.senderDisplayName }}
            </span>
            <p>{{ message.content }}</p>
            <time [attr.datetime]="message.createdAt">{{ message.createdAt | localDate:'short' }}</time>
          </div>
        </div>

        <!-- دعوة اختيارية لتقييم المالك — تظهر للزائر فقط بعد تواصل فعلي (رسالة واحدة على الأقل).
             الأهلية الحقيقية يفرضها الخادم (GET/POST /api/Users/{id}/ratings). -->
        <div class="rate-prompt" *ngIf="!isOwnerView() && thread().length > 0 && property()?.ownerId as ownerId">
          <span>{{ 'MESSAGES.RATE_PROMPT' | translate }}</span>
          <a [routerLink]="['/users', ownerId]" fragment="rate-user" class="rate-prompt__link">
            ⭐ {{ 'MESSAGES.RATE_OWNER' | translate }}
          </a>
        </div>

        <form class="composer" (ngSubmit)="send()">
          <label class="visually-hidden" for="messageDraft">{{ 'MESSAGES.PLACEHOLDER' | translate }}</label>
          <textarea
            id="messageDraft"
            [(ngModel)]="draft"
            name="draft"
            rows="2"
            [maxlength]="maxLength"
            [placeholder]="'MESSAGES.PLACEHOLDER' | translate"
          ></textarea>
          <button type="submit" class="btn btn--primary" [disabled]="sending() || !draft.trim()">
            <span *ngIf="sending()" class="spinner-ring"></span>
            {{ sending() ? ('COMMON.SAVING' | translate) : ('MESSAGES.SEND' | translate) }}
          </button>
        </form>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 760px; margin: 0 auto; width: 100%; box-sizing: border-box; }
    .page-header { display:flex; align-items:center; gap:.75rem; margin-bottom:1.25rem; min-width:0; }
    .page-header__text { min-width:0; }
    .back-btn { width:40px;height:40px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface);display:grid;place-items:center;cursor:pointer;color: var(--text-strong); flex-shrink:0; }
    .page-header h1 { margin:0;font-size:clamp(1.4rem,2.6vw,1.9rem);color: var(--text-strong); font-family: var(--font-display); }
    .subtitle { display:block; margin:.15rem 0 0;color:var(--gray-500);font-size:var(--text-sm); }
    .subtitle:hover { color:var(--primary-text); text-decoration:underline; }

    .state-card.error { display:flex;align-items:center;gap:.75rem;color:var(--danger-text);background:var(--danger-soft);border:1px solid rgba(220,38,38,.2);border-radius:var(--r-lg);padding:1rem; }

    .thread { display:flex; flex-direction:column; gap:1rem; min-width:0; }
    .thread-bar { display:flex; align-items:center; gap:.5rem 1rem; flex-wrap:wrap; }
    .thread-back { background:none;border:0;color:var(--primary-text);cursor:pointer;font-weight:600;padding:0; }
    .thread-with { color:var(--gray-700); font-weight:600; overflow-wrap:anywhere; }
    .thread-profile-link { color:var(--gray-600,#6b7280); font-size:.8rem; text-decoration:none; }
    .thread-profile-link:hover { text-decoration:underline; color:var(--primary-text); }
    .thread-older-hint { margin:0; font-size:var(--text-xs); color:var(--text-muted); text-align:center; }
    .thread-messages { display:flex; flex-direction:column; gap:.6rem; max-height:55vh; max-height:55dvh; overflow-y:auto; padding:.25rem; }
    .bubble {
      max-width:min(78%, 34rem); background:var(--gray-100); border-radius:var(--r-lg); padding:.6rem .9rem;
      align-self:flex-start; box-shadow:var(--shadow-xs); min-width:0;
    }
    .bubble--mine { align-self:flex-end; background:var(--primary-soft); border:1px solid rgba(214,168,79,.25); }
    .bubble__sender { display:block; font-size:var(--text-xs); font-weight:700; color: var(--text-strong); margin-bottom:.15rem; }
    .bubble p { margin:0 0 .25rem; color:var(--gray-800); line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
    .bubble time { font-size:var(--text-xs); color:var(--text-muted); }

    .rate-prompt {
      display:flex; align-items:center; justify-content:space-between; gap:.5rem 1rem; flex-wrap:wrap;
      background:var(--warning-soft); border-radius:var(--r-md); padding:.6rem .9rem; font-size:var(--text-sm); color:var(--gray-700);
    }
    .rate-prompt__link { color:var(--warning-text); font-weight:700; white-space:nowrap; }

    .composer { display:flex; gap:.6rem; align-items:flex-end; position:sticky; bottom:0; background:var(--page-bg); padding-block:.5rem; }
    .composer textarea {
      flex:1; min-width:0; border:1px solid var(--border); border-radius:var(--r-md); padding:.6rem .8rem;
      font-family:inherit; font-size:16px; resize:vertical; min-height:44px; max-height:40vh;
    }
    .composer textarea:focus { outline:none; border-color:var(--border-focus); }
    .btn--primary {
      border:0; background:var(--navy); color:#fff; border-radius:var(--r-md); min-height:44px;
      padding:.65rem 1.1rem; cursor:pointer; white-space:nowrap; font-weight:600;
      display:flex; align-items:center; gap:.4rem; flex-shrink:0;
    }
    .btn--primary:disabled { background:var(--gray-300); cursor:not-allowed; }
    .spinner-ring { width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite; }
    .visually-hidden { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `]
})
export class PropertyMessagesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messagesApi = inject(MessagesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('threadScroller') private threadScroller?: ElementRef<HTMLElement>;

  readonly maxLength = MESSAGE_CONTENT_MAX_LENGTH;
  readonly currentUserId = this.auth.getCurrentUserId();

  readonly property = signal<Property | null>(null);
  readonly conversations = signal<ConversationSummaryDto[]>([]);
  readonly thread = signal<MessageDto[]>([]);
  readonly totalInThread = signal(0);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly sending = signal(false);
  readonly activeOtherUserId = signal<string | null>(null);

  draft = '';
  private propertyId = '';

  readonly isOwnerView = computed(() => {
    const p = this.property();
    return !!p && !!this.currentUserId && p.ownerId === this.currentUserId;
  });

  /** الطرف الآخر: المالك يراسل الزائر المختار، والزائر يراسل مالك العقار دائمًا. */
  readonly counterpartProfileId = computed<string | null>(() =>
    this.isOwnerView() ? this.activeOtherUserId() : (this.property()?.ownerId ?? null)
  );

  readonly counterpartName = computed(() => {
    const otherId = this.counterpartProfileId();
    if (!otherId) return '';
    const fromThread = this.thread().find(m => m.senderId === otherId)?.senderDisplayName;
    const fromList = this.conversations().find(c => c.otherUserId === otherId)?.otherUserDisplayName;
    return fromThread || fromList || '';
  });

  readonly hasOlderMessages = computed(() => this.totalInThread() > this.thread().length);

  ngOnInit(): void {
    this.propertyId = this.route.snapshot.paramMap.get('propertyId') ?? '';

    if (!this.propertyId) {
      this.error.set('MESSAGES.MISSING_PROPERTY');
      this.loading.set(false);
      return;
    }

    this.activeOtherUserId.set(this.route.snapshot.queryParamMap.get('with'));
    this.load();

    // رد جديد يصل لحظيًا بخصوص هذا العقار → حدّث المحادثة المفتوحة (أو القائمة).
    this.notificationsApi.realtime$
      .pipe(
        filter(n => n.type === 'NewMessage' && (!n.propertyId || n.propertyId === this.propertyId)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.refreshCurrentView());
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');

    this.propertyApi
      .getProperty(this.propertyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: property => {
          this.property.set(property);
          this.refreshCurrentView();
        },
        error: () => {
          this.error.set('MESSAGES.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private refreshCurrentView(): void {
    if (this.isOwnerView() && !this.activeOtherUserId()) {
      this.loadConversations();
    } else {
      this.loadThread();
    }
  }

  private loadConversations(): void {
    this.messagesApi
      .getConversations(this.propertyId, 1, MESSAGES_MAX_PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.conversations.set(result.items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('MESSAGES.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private loadThread(): void {
    const otherUserId = this.counterpartProfileId();

    if (!otherUserId) {
      this.thread.set([]);
      this.loading.set(false);
      return;
    }

    // أحدث 50 رسالة (الحد الذي يقبله الخادم)، تُعرض بترتيب زمني تصاعدي.
    this.messagesApi
      .getPropertyMessages(this.propertyId, otherUserId, 1, MESSAGES_MAX_PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.thread.set(sortChronologically(result.items));
          this.totalInThread.set(result.totalCount);
          this.loading.set(false);
          this.scrollToLatest();
          this.markRead(otherUserId, result.items);
        },
        error: () => {
          this.error.set('MESSAGES.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private markRead(otherUserId: string, messages: MessageDto[]): void {
    const hasUnread = messages.some(m => !m.isRead && m.receiverId === this.currentUserId);
    if (!hasUnread) return;

    this.messagesApi
      .markConversationRead(this.propertyId, otherUserId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => { /* حالة القراءة غير حرجة للعرض */ } });
  }

  openConversation(otherUserId: string): void {
    this.activeOtherUserId.set(otherUserId);
    this.thread.set([]);
    this.loading.set(true);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { with: otherUserId },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
    this.loadThread();
  }

  closeConversation(): void {
    this.activeOtherUserId.set(null);
    this.thread.set([]);
    this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    this.loading.set(true);
    this.loadConversations();
  }

  send(): void {
    const validationError = validateMessageContent(this.draft);
    if (validationError) {
      this.toast.error(this.translate.instant(validationError));
      return;
    }

    // الزائر لا يمرّر receiverId (الخادم يوجّه الرسالة للمالك)، والمالك يرد على المحادثة المختارة.
    const receiverId = this.isOwnerView() ? this.activeOtherUserId() : null;

    if (this.isOwnerView() && !receiverId) {
      this.toast.error(this.translate.instant('MESSAGES.SELECT_CONVERSATION_FIRST'));
      return;
    }

    this.sending.set(true);

    this.messagesApi
      .sendMessage({ propertyId: this.propertyId, receiverId, content: this.draft })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: message => {
          this.thread.update(items => sortChronologically([...items, message]));
          this.totalInThread.update(n => n + 1);
          this.draft = '';
          this.sending.set(false);
          this.scrollToLatest();
        },
        error: err => {
          const backendMessage = err?.error?.message as string | undefined;
          this.toast.error(backendMessage || this.translate.instant('MESSAGES.SEND_ERROR'));
          this.sending.set(false);
        }
      });
  }

  goBack(): void {
    if (this.isOwnerView() && this.activeOtherUserId()) {
      this.closeConversation();
      return;
    }
    this.router.navigate(['/messages']);
  }

  private scrollToLatest(): void {
    setTimeout(() => {
      const el = this.threadScroller?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  trackByMessageId(_: number, message: MessageDto): string {
    return message.id;
  }
}
