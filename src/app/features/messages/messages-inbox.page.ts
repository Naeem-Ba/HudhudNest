// =============================================================
// src/app/features/messages/messages-inbox.page.ts
//
// صفحة "رسائلي" (المسار: /messages) — كل محادثات المستخدم الحالي عبر كل
// العقارات: استفساراته هو لملّاك عقارات أخرى، والاستفسارات الواردة على
// عقاراته. الضغط على صف يفتح المحادثة في /messages/:propertyId?with=userId.
// =============================================================

import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { debounceTime, filter, merge } from 'rxjs';

import { MessagesApiService } from '../../core/api/messages-api.service';
import { NotificationsApiService } from '../../core/api/notifications-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { ConversationSummaryDto } from '../../core/models/message.model';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ConversationListComponent } from './conversation-list.component';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-messages-inbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, TranslateModule, LoadingSpinnerComponent, EmptyStateComponent, ConversationListComponent],
  template: `
    <section class="page">
      <header class="page-header">
        <h1>{{ 'MESSAGES.INBOX_TITLE' | translate }}</h1>
        <p class="subtitle">{{ 'MESSAGES.INBOX_SUBTITLE' | translate }}</p>
      </header>

      <app-loading-spinner *ngIf="loading()" [label]="'COMMON.LOADING' | translate"></app-loading-spinner>

      <div class="state-card error" *ngIf="!loading() && error()" role="alert">
        <span aria-hidden="true">⚠️</span>
        <p>{{ 'MESSAGES.LOAD_ERROR' | translate }}</p>
        <button type="button" class="link-btn" (click)="reload()">{{ 'COMMON.RETRY' | translate }}</button>
      </div>

      <ng-container *ngIf="!loading() && !error()">
        <app-empty-state
          *ngIf="conversations().length === 0"
          icon="💬"
          [title]="'MESSAGES.INBOX_EMPTY_TITLE' | translate"
          [message]="'MESSAGES.INBOX_EMPTY_MESSAGE' | translate"
        ></app-empty-state>

        <app-conversation-list
          *ngIf="conversations().length > 0"
          [conversations]="conversations()"
          [currentUserId]="currentUserId"
          (open)="openConversation($event)"
        ></app-conversation-list>

        <button type="button" class="load-more" *ngIf="hasMore()" [disabled]="loadingMore()" (click)="loadMore()">
          {{ loadingMore() ? ('COMMON.LOADING' | translate) : ('MESSAGES.LOAD_MORE' | translate) }}
        </button>
      </ng-container>
    </section>
  `,
  styles: [`
    .page { padding: clamp(1rem, 3vw, 2rem); max-width: 760px; margin: 0 auto; width: 100%; box-sizing: border-box; }
    .page-header { margin-bottom: 1.25rem; }
    .page-header h1 { margin:0; font-size:clamp(1.4rem,2.6vw,1.9rem); color: var(--text-strong); font-family:var(--font-display); }
    .subtitle { margin:.25rem 0 0; color:var(--gray-500); font-size:var(--text-sm); }
    .state-card.error { display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; color:var(--danger-text); background:var(--danger-soft);
      border:1px solid rgba(220,38,38,.2); border-radius:var(--r-lg); padding:1rem; }
    .state-card.error p { margin:0; flex:1; }
    .link-btn { background:none; border:0; color:var(--primary-text); font-weight:600; cursor:pointer; }
    .load-more { display:block; margin:1rem auto 0; background:var(--surface); border:1px solid var(--border);
      border-radius:var(--r-pill); padding:.55rem 1.4rem; cursor:pointer; color: var(--text-strong); font-weight:600; }
    .load-more:disabled { opacity:.6; cursor:default; }
  `]
})
export class MessagesInboxPage implements OnInit {
  private readonly messagesApi = inject(MessagesApiService);
  private readonly notificationsApi = inject(NotificationsApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUserId = this.auth.getCurrentUserId();

  readonly conversations = signal<ConversationSummaryDto[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal(false);
  readonly hasMore = signal(false);

  private page = 1;

  ngOnInit(): void {
    this.reload();

    // رسالة جديدة تصل لحظيًا (SignalR) → تحديث القائمة كي يظهر الرد وعدّاد غير المقروء فورًا.
    // QA phase 25 (P25-D02): MessageReceived arrives for every message, also when the notice was folded away.
    merge(
      this.notificationsApi.realtime$.pipe(filter(n => n.type === 'NewMessage')),
      this.notificationsApi.messageReceived$,
      this.notificationsApi.resync$
    )
      .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reload(false));
  }

  reload(showSpinner = true): void {
    this.page = 1;
    if (showSpinner) this.loading.set(true);
    this.error.set(false);

    this.messagesApi
      .getConversations(null, 1, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.conversations.set(result.items);
          this.hasMore.set(result.items.length < result.totalCount);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        }
      });
  }

  loadMore(): void {
    this.loadingMore.set(true);
    const nextPage = this.page + 1;

    this.messagesApi
      .getConversations(null, nextPage, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.page = nextPage;
          const merged = [...this.conversations(), ...result.items];
          this.conversations.set(merged);
          this.hasMore.set(merged.length < result.totalCount);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false)
      });
  }

  openConversation(convo: ConversationSummaryDto): void {
    this.router.navigate(['/messages', convo.propertyId], { queryParams: { with: convo.otherUserId } });
  }
}
