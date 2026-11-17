import {
  AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, ViewChild,
  computed, inject, input, output, signal
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { HudhudAiApiService, aiErrorCode } from '../../core/api/hudhud-ai-api.service';
import {
  AiChatResponse, AiConversationSummary, AiErrorCode, AiPropertyCard, AiSendPayload, AiStatus,
  AiStoredMessage, AiUnderstoodFilter, AiUsage
} from '../../core/models/hudhud-ai.model';
import { LanguageService } from '../../core/services/language.service';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';
import { LocalizedNumberPipe } from '../../shared/pipes/localized-number.pipe';
import { aiFilterChips, AiChip } from './hudhud-ai-chips';

export interface AiChatItem {
  localId: number;
  role: 'user' | 'assistant';
  text: string;
  /** The assistant's full answer (live messages); stored messages only carry text, filter and cards. */
  response?: AiChatResponse;
  filter?: AiUnderstoodFilter | null;
  cards?: AiPropertyCard[];
  messageId?: string | null;
  rating?: number | null;
  /** The request a user message was sent with, so it can be sent again unchanged (same client id). */
  payload?: AiSendPayload;
  /** A user message whose answer did not arrive: why, and the request to send again. */
  failed?: { code: AiErrorCode; payload: AiSendPayload };
}

function newClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/**
 * The Hudhud AI chat. Every text is rendered as plain text (interpolation, never innerHTML). Cards, prices and the
 * comparison table come from the server's public listing record. A guest's conversation lives only in this panel;
 * a signed-in user's is stored on the server for its retention period and can be deleted here.
 */
@Component({
  selector: 'app-hudhud-ai-panel',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslateModule, LocalizedNumberPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hudhud-ai-panel.component.html',
  styleUrl: './hudhud-ai-panel.component.scss'
})
export class HudhudAiPanelComponent implements AfterViewInit, OnDestroy {
  readonly status = input.required<AiStatus>();
  readonly closed = output<void>();

  private readonly api = inject(HudhudAiApiService);
  private readonly auth = inject(AuthService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly backHandlers = inject(OverlayBackHandlerService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('log') private log?: ElementRef<HTMLElement>;
  @ViewChild('input') private inputRef?: ElementRef<HTMLTextAreaElement>;

  readonly loggedIn = toSignal(this.auth.isLoggedIn$, { initialValue: false });
  readonly items = signal<AiChatItem[]>([]);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly usage = signal<AiUsage | null>(null);
  readonly conversationId = signal<string | null>(null);
  readonly view = signal<'chat' | 'history'>('chat');
  readonly history = signal<AiConversationSummary[] | null>(null);
  readonly historyError = signal(false);
  readonly selected = signal<string[]>([]);
  readonly notice = signal<AiErrorCode | null>(null);

  readonly maxLength = computed(() => Math.max(1, this.status().maxMessageCharacters || 1000));
  readonly canSend = computed(() => !this.busy() && this.draft().trim().length > 0 && this.draft().length <= this.maxLength()
    && (this.loggedIn() || this.status().guestsEnabled));
  readonly guestBlocked = computed(() => !this.loggedIn() && !this.status().guestsEnabled);
  readonly starterSuggestions = computed(() => this.suggestionsFor(this.language.getCurrent()));

  private nextId = 1;
  private inFlight: Subscription | null = null;
  private lastFilter: AiUnderstoodFilter | null = null;
  private unregisterBack: (() => void) | null = null;

  constructor() {
    this.scrollLock.lock();
    this.unregisterBack = this.backHandlers.register(() => {
      if (this.view() === 'history') { this.view.set('chat'); return true; }
      this.close();
      return true;
    });
    this.api.usage().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: u => this.usage.set(u), error: () => undefined });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.inputRef?.nativeElement.focus(), 0);
  }

  ngOnDestroy(): void {
    this.inFlight?.unsubscribe();
    this.unregisterBack?.();
    this.scrollLock.unlock();
  }

  close(): void {
    this.closed.emit();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  submit(): void {
    if (!this.canSend()) return;
    const text = this.draft().trim();
    this.draft.set('');
    this.send(text);
  }

  useSuggestion(text: string): void {
    if (this.busy()) return;
    this.send(text);
  }

  compareSelected(): void {
    const ids = this.selected();
    if (ids.length < 2 || this.busy()) return;
    this.selected.set([]);
    this.send('', ids);
  }

  toggleSelected(id: string): void {
    const current = this.selected();
    if (current.includes(id)) this.selected.set(current.filter(x => x !== id));
    else if (current.length < 4) this.selected.set([...current, id]);
  }

  isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  /** Stops waiting for the answer. The request may still have reached the server; a retry is answered once. */
  stop(): void {
    if (!this.inFlight) return;
    this.inFlight.unsubscribe();
    this.inFlight = null;
    this.busy.set(false);
    this.items.update(list => list.map((item, i) => i === list.length - 1 && item.role === 'user' && !item.failed
      ? { ...item, failed: { code: 'AI_FAILED' as AiErrorCode, payload: item.payload ?? this.payloadFor(item.text) } }
      : item));
  }

  retry(item: AiChatItem): void {
    if (!item.failed || this.busy()) return;
    const payload = item.failed.payload;
    this.items.update(list => list.map(x => x.localId === item.localId ? { ...x, failed: undefined } : x));
    this.dispatch(payload, item.localId);
  }

  rate(item: AiChatItem, rating: 1 | -1): void {
    if (!item.messageId || !this.loggedIn()) return;
    const previous = item.rating ?? null;
    this.setRating(item.localId, rating);
    this.api.feedback(item.messageId, rating).subscribe({ error: () => this.setRating(item.localId, previous) });
  }

  newConversation(): void {
    this.inFlight?.unsubscribe();
    this.inFlight = null;
    this.busy.set(false);
    this.items.set([]);
    this.conversationId.set(null);
    this.lastFilter = null;
    this.selected.set([]);
    this.notice.set(null);
    this.view.set('chat');
  }

  openHistory(): void {
    this.view.set('history');
    this.history.set(null);
    this.historyError.set(false);
    this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => this.history.set(list),
      error: () => { this.history.set([]); this.historyError.set(true); }
    });
  }

  openConversation(summary: AiConversationSummary): void {
    this.api.conversation(summary.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => {
        this.newConversation();
        this.conversationId.set(detail.conversation.id);
        this.items.set(detail.messages.map(m => this.fromStored(m)));
        this.lastFilter = [...detail.messages].reverse().find(m => m.understoodFilter)?.understoodFilter ?? null;
        this.scrollToEnd();
      },
      error: () => this.historyError.set(true)
    });
  }

  deleteConversation(id: string): void {
    this.api.deleteConversation(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.history.update(list => (list ?? []).filter(c => c.id !== id));
        if (this.conversationId() === id) this.newConversation();
      },
      error: () => this.historyError.set(true)
    });
  }

  /** "Show all results" opens the normal search page with the same filter. */
  openSearch(url: string): void {
    if (!url.startsWith('/properties')) return;
    this.close();
    void this.router.navigateByUrl(url);
  }

  chipsOf(filter: AiUnderstoodFilter | null | undefined): AiChip[] {
    return aiFilterChips(filter);
  }

  priceSuffixKey(card: AiPropertyCard): string | null {
    return card.priceKind === 'ColdRent' || card.priceKind === 'WarmRent' ? 'AI.PER_MONTH' : null;
  }

  trackItem = (_: number, item: AiChatItem) => item.localId;

  private send(text: string, compareIds?: string[]): void {
    const payload = this.payloadFor(text, compareIds);
    const localId = this.nextId++;
    const shown = compareIds ? '⇄' : text;
    this.items.update(list => [...list, { localId, role: 'user', text: shown, payload }]);
    this.dispatch(payload, localId);
  }

  private payloadFor(text: string, compareIds?: string[]): AiSendPayload {
    return {
      text,
      language: this.language.getCurrent(),
      clientMessageId: newClientId(),
      compareIds: compareIds && compareIds.length ? compareIds : undefined,
      // Guests have no stored conversation: the last understood filter is the only context, checked again by the server.
      previousFilter: this.loggedIn() ? undefined : this.lastFilter
    };
  }

  private dispatch(payload: AiSendPayload, userLocalId: number): void {
    this.busy.set(true);
    this.notice.set(null);
    this.scrollToEnd();
    const conversationId = this.loggedIn() ? this.conversationId() : null;
    this.inFlight = this.api.send(payload, conversationId).subscribe({
      next: response => {
        this.inFlight = null;
        this.busy.set(false);
        if (response.conversationId) this.conversationId.set(response.conversationId);
        if (response.understoodFilter) this.lastFilter = response.understoodFilter;
        if (response.usage) this.usage.set(response.usage);
        this.items.update(list => [...list, {
          localId: this.nextId++,
          role: 'assistant',
          text: response.text,
          response,
          filter: response.understoodFilter,
          cards: response.results?.cards ?? [],
          messageId: response.messageId,
          rating: null
        }]);
        this.scrollToEnd();
      },
      error: error => {
        this.inFlight = null;
        this.busy.set(false);
        const code = aiErrorCode(error);
        // A conversation that is gone (deleted elsewhere, expired) restarts instead of failing forever.
        if (code === 'AI_NOT_FOUND' && conversationId) this.conversationId.set(null);
        if (code === 'AI_QUOTA_DAILY' || code === 'AI_QUOTA_MONTHLY') {
          const usage = (error?.error as { usage?: AiUsage } | undefined)?.usage;
          if (usage) this.usage.set(usage);
        }
        this.notice.set(code);
        this.items.update(list => list.map(x => x.localId === userLocalId ? { ...x, failed: { code, payload } } : x));
      }
    });
  }

  private fromStored(m: AiStoredMessage): AiChatItem {
    return {
      localId: this.nextId++,
      role: m.role,
      text: m.text,
      filter: m.understoodFilter,
      cards: m.cards,
      messageId: m.role === 'assistant' ? m.id : null,
      rating: m.rating
    };
  }

  private setRating(localId: number, rating: number | null): void {
    this.items.update(list => list.map(x => x.localId === localId ? { ...x, rating } : x));
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const el = this.log?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  private suggestionsFor(lang: string): string[] {
    switch (lang) {
      case 'de': return ['Wohnung zur Miete in Damaskus', 'Wohnung zum Kauf in Aleppo bis 50000 Dollar', 'Hilfe'];
      case 'en': return ['Apartment for rent in Damascus', 'Apartment for sale in Aleppo under 50000 dollars', 'Help'];
      case 'tr': return ["Şam'da kiralık daire", "Halep'te satılık daire en fazla 50000 dolar", 'Yardım'];
      default: return ['شقة للإيجار في دمشق', 'شقة للبيع في حلب حتى 50 ألف دولار', 'مساعدة'];
    }
  }
}
