// =============================================================
// src/app/features/messages/property-messages.page.ts
//
// شاشة موحّدة للمراسلة الخاصة بعقار واحد (المسار: /messages/:propertyId?with=userId)
//
// لماذا صفحة واحدة وليس Inbox عام + صفحة محادثة منفصلة؟
// لأن MessagesController في الـ Backend لا يوفر أي endpoint لتجميع كل
// محادثات المستخدم عبر كل العقارات دفعة واحدة (تحقّق مباشر من الكود:
// GetMessagesQuery يتطلب PropertyId إلزامياً). لذلك:
//   - الزائر (غير المالك): يفتح هذه الصفحة من زر "راسل المالك" في تفاصيل
//     العقار → يرى مباشرة محادثته الوحيدة مع المالك (لا يوجد اختيار).
//   - المالك: يفتحها من رابط "الرسائل" في "عقاراتي" لعقار محدد → يرى قائمة
//     كل من راسله بخصوص هذا العقار (تُجمَّع في الواجهة من الاستجابة المسطّحة)
//     ثم يختار محادثة ليرد عليها.
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { MessagesApiService } from '../../core/api/messages-api.service';
import { PropertyApiService } from '../../core/api/property-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/services/toast.service';
import { ConversationGroup, MessageDto, groupMessagesByCounterpart, validateMessageContent } from '../../core/models/message.model';
import { Property } from '../../core/models/property.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';

@Component({
  selector: 'app-property-messages',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <button type="button" class="back-btn" (click)="goBack()" [attr.aria-label]="'COMMON.BACK' | translate">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M11 3L5 9l6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div>
          <h1>{{ 'MESSAGES.TITLE' | translate }}</h1>
          <p *ngIf="property() as p" class="subtitle">{{ p.title }}</p>
        </div>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state-card error" *ngIf="!loading() && error()" role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>{{ error() | translate }}</p>
      </div>

      <!-- ── وضع المالك: قائمة المحادثات ── -->
      <ng-container *ngIf="!loading() && !error() && isOwnerView() && !activeOtherUserId()">
        <app-empty-state
          *ngIf="conversations().length === 0"
          icon="💬"
          [title]="'MESSAGES.EMPTY_TITLE' | translate"
          [message]="'MESSAGES.EMPTY_OWNER_MESSAGE' | translate"
        ></app-empty-state>

        <div class="conversation-list" *ngIf="conversations().length > 0">
          <button
            type="button"
            class="conversation-row"
            *ngFor="let convo of conversations(); trackBy: trackByOtherUser"
            (click)="openConversation(convo.otherUserId)"
          >
            <span class="avatar" aria-hidden="true">{{ initials(convo.otherUserDisplayName) }}</span>
            <span class="conversation-row__body">
              <strong>{{ convo.otherUserDisplayName || ('MESSAGES.UNKNOWN_USER' | translate) }}</strong>
              <span class="preview line-clamp-1">{{ convo.lastMessage.content }}</span>
            </span>
            <span class="conversation-row__meta">
              <time>{{ convo.lastMessage.createdAt | date:'short' }}</time>
              <span class="unread-badge" *ngIf="convo.unreadCount > 0">{{ convo.unreadCount }}</span>
            </span>
          </button>
        </div>
      </ng-container>

      <!-- ── وضع المحادثة (زائر، أو مالك اختار محادثة) ── -->
      <div class="thread" *ngIf="!loading() && !error() && (!isOwnerView() || activeOtherUserId())">
        <button type="button" class="thread-back" *ngIf="isOwnerView()" (click)="closeConversation()">
          ← {{ 'MESSAGES.BACK_TO_LIST' | translate }}
        </button>

        <!-- ✅ إضافة: رابط الملف الشخصي العام للطرف الآخر في المحادثة -->
        <a
          *ngIf="counterpartProfileId() as pid"
          class="thread-profile-link"
          [routerLink]="['/users', pid]"
        >
          {{ 'PUBLIC_PROFILE.VIEW_PROFILE_LINK' | translate }}
        </a>

        <app-empty-state
          *ngIf="thread().length === 0"
          icon="💬"
          [title]="'MESSAGES.EMPTY_TITLE' | translate"
          [message]="'MESSAGES.EMPTY_THREAD_MESSAGE' | translate"
        ></app-empty-state>

        <div class="thread-messages" *ngIf="thread().length > 0">
          <div
            class="bubble"
            *ngFor="let message of thread(); trackBy: trackByMessageId"
            [class.bubble--mine]="message.senderId === currentUserId"
          >
            <p>{{ message.content }}</p>
            <time>{{ message.createdAt | date:'short' }}</time>
          </div>
        </div>

        <form class="composer" (ngSubmit)="send()">
          <textarea
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
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 760px; margin: 0 auto; }
    .page-header { display:flex; align-items:center; gap:.75rem; margin-bottom:1.25rem; }
    .back-btn { width:38px;height:38px;border-radius:var(--r-pill);border:1px solid var(--border);background:var(--surface);display:grid;place-items:center;cursor:pointer;color:var(--navy); flex-shrink:0; }
    .page-header h1 { margin:0;font-size:clamp(1.4rem,2.6vw,1.9rem);color:var(--navy); font-family: var(--font-display); }
    .subtitle { margin:.15rem 0 0;color:var(--gray-500);font-size:var(--text-sm); }

    .state-card.error { display:flex;align-items:center;gap:.75rem;color:var(--danger);background:var(--danger-soft);border:1px solid #fecaca;border-radius:var(--r-lg);padding:1rem; }

    .conversation-list { display:flex; flex-direction:column; gap:.6rem; }
    .conversation-row {
      display:flex; align-items:center; gap:.85rem; width:100%; text-align:start;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg);
      padding:.9rem 1rem; cursor:pointer; box-shadow:var(--shadow-xs); transition:box-shadow .15s, transform .15s;
    }
    .conversation-row:hover { box-shadow:var(--shadow-md); transform:translateY(-1px); }
    .avatar {
      width:42px;height:42px;border-radius:50%;background:var(--navy);color:var(--gold-light);
      display:grid;place-items:center;font-weight:700;flex-shrink:0;font-family:var(--font-display);
    }
    .conversation-row__body { flex:1; min-width:0; display:flex; flex-direction:column; gap:.15rem; }
    .conversation-row__body strong { color:var(--navy); }
    .preview { color:var(--gray-500); font-size:var(--text-sm); }
    .conversation-row__meta { display:flex; flex-direction:column; align-items:flex-end; gap:.3rem; flex-shrink:0; }
    .conversation-row__meta time { color:var(--gray-400); font-size:var(--text-xs); }
    .unread-badge {
      background:var(--primary); color:#fff; border-radius:var(--r-pill); font-size:var(--text-xs);
      min-width:20px; height:20px; display:grid; place-items:center; padding:0 .35rem;
    }

    .thread { display:flex; flex-direction:column; gap:1rem; }
    .thread-back { align-self:flex-start; background:none;border:0;color:var(--primary);cursor:pointer;font-weight:600;padding:0; }
    .thread-profile-link { align-self:flex-start; color:var(--gray-600,#6b7280); font-size:.8rem; text-decoration:none; }
    .thread-profile-link:hover { text-decoration:underline; color:var(--primary); }
    .thread-messages { display:flex; flex-direction:column; gap:.6rem; max-height:55vh; overflow-y:auto; padding:.25rem; }
    .bubble {
      max-width:78%; background:var(--gray-100); border-radius:var(--r-lg); padding:.6rem .9rem;
      align-self:flex-start; box-shadow:var(--shadow-xs);
    }
    .bubble--mine { align-self:flex-end; background:var(--primary-soft); border:1px solid #bfdbfe; }
    .bubble p { margin:0 0 .25rem; color:var(--gray-800); line-height:1.6; white-space:pre-wrap; }
    .bubble time { font-size:var(--text-xs); color:var(--gray-400); }

    .composer { display:flex; gap:.6rem; align-items:flex-end; position:sticky; bottom:0; background:var(--page-bg); padding-top:.5rem; }
    .composer textarea {
      flex:1; border:1px solid var(--border); border-radius:var(--r-md); padding:.6rem .8rem;
      font-family:inherit; resize:vertical; min-height:44px;
    }
    .composer textarea:focus { outline:none; border-color:var(--border-focus); }
    .btn--primary {
      border:0; background:var(--navy); color:#fff; border-radius:var(--r-md);
      padding:.65rem 1.2rem; cursor:pointer; white-space:nowrap; font-weight:600;
      display:flex; align-items:center; gap:.4rem;
    }
    .btn--primary:disabled { background:var(--gray-300); cursor:not-allowed; }
    .spinner-ring { width:14px;height:14px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
  `]
})
export class PropertyMessagesPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly messagesApi = inject(MessagesApiService);
  private readonly propertyApi = inject(PropertyApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly maxLength = 3000;
  readonly currentUserId = this.auth.getCurrentUserId();

  readonly property = signal<Property | null>(null);
  readonly allMessages = signal<MessageDto[]>([]);
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

  readonly conversations = computed<ConversationGroup[]>(() =>
    groupMessagesByCounterpart(this.allMessages(), this.currentUserId)
  );

  // الطرف الآخر بالمحادثة: المالك يراسل الزائر النشط (activeOtherUserId)،
  // والزائر يراسل مالك العقار (property.ownerId) دائماً.
  readonly counterpartProfileId = computed<string | null>(() => {
    if (this.isOwnerView()) {
      return this.activeOtherUserId();
    }
    return this.property()?.ownerId ?? null;
  });

  readonly thread = computed<MessageDto[]>(() => {
    const otherId = this.isOwnerView() ? this.activeOtherUserId() : null;

    // زائر: كل الرسائل المُعادة هي محادثته الوحيدة أصلاً (otherUserId مُمرَّر للـ Backend).
    if (!this.isOwnerView()) {
      return [...this.allMessages()].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }

    if (!otherId) return [];

    return this.allMessages()
      .filter(m => m.senderId === otherId || m.receiverId === otherId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  ngOnInit(): void {
    this.propertyId = this.route.snapshot.paramMap.get('propertyId') ?? '';
    const withParam = this.route.snapshot.queryParamMap.get('with');

    if (!this.propertyId) {
      this.error.set('MESSAGES.MISSING_PROPERTY');
      this.loading.set(false);
      return;
    }

    if (withParam) {
      this.activeOtherUserId.set(withParam);
    }

    this.load();
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
          this.loadMessages();
        },
        error: () => {
          this.error.set('MESSAGES.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  private loadMessages(): void {
    // الزائر (غير المالك) يجب أن يمرّر معرّف المالك كـ otherUserId كي يرى محادثته معه.
    const otherUserId = this.isOwnerView()
      ? (this.activeOtherUserId() ?? undefined)
      : (this.property()?.ownerId ?? undefined);

    this.messagesApi
      .getPropertyMessages(this.propertyId, otherUserId, 1, 200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.allMessages.set(result.items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('MESSAGES.LOAD_ERROR');
          this.loading.set(false);
        }
      });
  }

  openConversation(otherUserId: string): void {
    this.activeOtherUserId.set(otherUserId);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { with: otherUserId },
      queryParamsHandling: 'merge'
    });
  }

  closeConversation(): void {
    this.activeOtherUserId.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  send(): void {
    const validationError = validateMessageContent(this.draft);
    if (validationError) {
      this.toast.error(this.translate.instant(validationError));
      return;
    }

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
          this.allMessages.update(items => [...items, message]);
          this.draft = '';
          this.sending.set(false);
        },
        error: () => {
          this.toast.error(this.translate.instant('MESSAGES.SEND_ERROR'));
          this.sending.set(false);
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/properties', this.propertyId]);
  }

  initials(name: string): string {
    return (name || '؟').trim().charAt(0).toUpperCase();
  }

  trackByOtherUser(_: number, convo: ConversationGroup): string {
    return convo.otherUserId;
  }

  trackByMessageId(_: number, message: MessageDto): string {
    return message.id;
  }
}
