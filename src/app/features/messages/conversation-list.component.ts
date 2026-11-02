// =============================================================
// src/app/features/messages/conversation-list.component.ts
//
// قائمة محادثات (صفوف صندوق الوارد) — مشتركة بين صفحة "رسائلي" العامة
// (/messages) وقائمة استفسارات عقار واحد لدى مالكه (/messages/:propertyId).
// البيانات تأتي جاهزة ومجمَّعة من GET /api/Messages/conversations.
// =============================================================

import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { ConversationSummaryDto } from '../../core/models/message.model';
import { ImageFallbackDirective } from '../../shared/directives/image-fallback.directive';
import { LocalizedDatePipe } from '../../shared/pipes/localized-date.pipe';

@Component({
  selector: 'app-conversation-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ LocalizedDatePipe,CommonModule, TranslateModule, ImageFallbackDirective],
  template: `
    <ul class="conversation-list">
      <li *ngFor="let convo of conversations; trackBy: trackByConversation">
        <button type="button" class="conversation-row" [class.conversation-row--unread]="convo.unreadCount > 0"
          (click)="open.emit(convo)">
          <img
            *ngIf="showProperty"
            class="conversation-row__thumb"
            [src]="convo.propertyImageUrl || '/images/no-image.svg'"
            appImageFallback="/images/no-image.svg"
            alt=""
            loading="lazy"
          />
          <span *ngIf="!showProperty" class="conversation-row__avatar" aria-hidden="true">
            {{ initials(convo.otherUserDisplayName) }}
          </span>

          <span class="conversation-row__body">
            <span class="conversation-row__top">
              <strong class="conversation-row__name">
                {{ convo.otherUserDisplayName || ('MESSAGES.UNKNOWN_USER' | translate) }}
              </strong>
              <span class="conversation-row__role">
                {{ (convo.isPropertyOwner ? 'MESSAGES.ROLE_INQUIRY' : 'MESSAGES.ROLE_OWNER') | translate }}
              </span>
            </span>
            <span *ngIf="showProperty" class="conversation-row__property line-clamp-1">
              {{ convo.propertyTitle || ('MESSAGES.UNKNOWN_PROPERTY' | translate) }}
            </span>
            <span class="conversation-row__preview line-clamp-1">
              <span *ngIf="convo.lastMessageSenderId === currentUserId">{{ 'MESSAGES.YOU_PREFIX' | translate }} </span>{{ convo.lastMessageContent }}
            </span>
          </span>

          <span class="conversation-row__meta">
            <time [attr.datetime]="convo.lastMessageAt">{{ convo.lastMessageAt | localDate:'short' }}</time>
            <span class="conversation-row__unread" *ngIf="convo.unreadCount > 0"
              [attr.aria-label]="'MESSAGES.UNREAD_ARIA' | translate: { count: convo.unreadCount }">
              {{ convo.unreadCount }}
            </span>
          </span>
        </button>
      </li>
    </ul>
  `,
  styles: [`
    .conversation-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.6rem; }
    .conversation-row {
      display:flex; align-items:center; gap:.8rem; width:100%; min-width:0; text-align:start;
      background:var(--surface); border:1px solid var(--border); border-radius:var(--r-lg);
      padding:.75rem .85rem; cursor:pointer; box-shadow:var(--shadow-xs); transition:box-shadow .15s, transform .15s;
      font:inherit; color:inherit;
    }
    .conversation-row:hover { box-shadow:var(--shadow-md); transform:translateY(-1px); }
    .conversation-row:focus-visible { outline:2px solid var(--border-focus); outline-offset:2px; }
    .conversation-row--unread { border-color:rgba(214,168,79,.35); }
    .conversation-row--unread .conversation-row__name,
    .conversation-row--unread .conversation-row__preview { font-weight:700; color:var(--gray-800); }

    .conversation-row__thumb {
      width:56px; height:56px; border-radius:var(--r-md); object-fit:cover; flex-shrink:0; background:var(--gray-100);
    }
    .conversation-row__avatar {
      width:44px; height:44px; border-radius:50%; background:var(--navy); color:var(--gold-light);
      display:grid; place-items:center; font-weight:700; flex-shrink:0; font-family:var(--font-display);
    }
    .conversation-row__body { flex:1; min-width:0; display:flex; flex-direction:column; gap:.15rem; }
    .conversation-row__top { display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; min-width:0; }
    .conversation-row__name { color: var(--text-strong); overflow-wrap:anywhere; }
    .conversation-row__role {
      font-size:var(--text-xs); color:var(--gray-500); background:var(--gray-100);
      border-radius:var(--r-pill); padding:.05rem .45rem; white-space:nowrap;
    }
    .conversation-row__property { color:var(--gray-600); font-size:var(--text-sm); }
    .conversation-row__preview { color:var(--gray-500); font-size:var(--text-sm); }
    .conversation-row__meta { display:flex; flex-direction:column; align-items:flex-end; gap:.3rem; flex-shrink:0; }
    .conversation-row__meta time { color:var(--gray-400); font-size:var(--text-xs); white-space:nowrap; }
    .conversation-row__unread {
      background:var(--primary); color: var(--on-primary); border-radius:var(--r-pill); font-size:var(--text-xs);
      min-width:20px; height:20px; display:grid; place-items:center; padding:0 .35rem;
    }
  `]
})
export class ConversationListComponent {
  @Input({ required: true }) conversations: ConversationSummaryDto[] = [];
  @Input() currentUserId: string | null = null;
  /** يعرض صورة العقار وعنوانه — مفيد في صندوق الوارد العام، لا في قائمة عقار واحد. */
  @Input() showProperty = true;
  @Output() readonly open = new EventEmitter<ConversationSummaryDto>();

  initials(name: string): string {
    return (name || '؟').trim().charAt(0).toUpperCase();
  }

  trackByConversation(_: number, convo: ConversationSummaryDto): string {
    return `${convo.propertyId}:${convo.otherUserId}`;
  }
}
