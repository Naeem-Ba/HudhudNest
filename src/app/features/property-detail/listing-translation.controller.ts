import { signal } from '@angular/core';
import { Subscription, timer } from 'rxjs';
import {
  ListingTranslation,
  ListingTranslationService,
  TranslationLanguage,
  TranslationListingKind
} from '../../core/api/listing-translation.service';

/**
 * loading      request in flight, within the wait budget (original text shown, spinner on the notice)
 * waiting      the wait budget passed; original text stays, the request/polling continues and swaps in the result
 * ready        at least one field has a translation
 * unavailable  failed, cooling down, disabled or out of quota - original text, with a retry button
 * none         nothing to do (translation not needed or not requested); no notice
 */
export type TranslationView = 'none' | 'loading' | 'waiting' | 'ready' | 'unavailable';

export interface TranslationControllerOptions {
  /** How long the page keeps the loading state before it settles for the original text. */
  waitBudgetMs: number;
  /** Upper bound of re-asks while the API reports another request is still translating. */
  maxPolls: number;
}

export const DEFAULT_TRANSLATION_OPTIONS: TranslationControllerOptions = { waitBudgetMs: 8000, maxPolls: 12 };

/**
 * Per-page state for automatic listing translation. Never blocks the listing: the page always renders
 * the original text and this controller only decides whether to show a translation instead.
 *  - one request per (listing, language); a stored result is reused in memory when the user switches
 *    between original and translation or comes back to the same pair;
 *  - starting another listing/language cancels the previous request, so a late answer never replaces
 *    the text of the listing now on screen;
 *  - polling is bounded, so a stuck backend can never cause an endless request loop.
 */
export class ListingTranslationController {
  readonly view = signal<TranslationView>('none');
  readonly showOriginal = signal(false);
  readonly title = signal<string | null>(null);
  readonly description = signal<string | null>(null);

  private readonly cache = new Map<string, ListingTranslation>();
  private requestSub?: Subscription;
  private waitSub?: Subscription;
  private pollSub?: Subscription;
  private key = '';
  private propertyId = '';
  private language: TranslationLanguage = 'ar';
  private kind: TranslationListingKind = 'property';
  private polls = 0;

  constructor(
    private readonly api: ListingTranslationService,
    private readonly options: TranslationControllerOptions = DEFAULT_TRANSLATION_OPTIONS
  ) {}

  /** Begins (or re-uses) the translation of a listing into a language. Safe to call repeatedly. */
  start(propertyId: string, language: TranslationLanguage, kind: TranslationListingKind = 'property'): void {
    const key = `${kind}|${propertyId}|${language}`;
    if (key === this.key && this.view() !== 'unavailable' && this.view() !== 'none') {
      return; // already loaded or in flight: re-rendering or re-navigating must not repeat the request
    }

    this.cancel();
    this.key = key;
    this.propertyId = propertyId;
    this.language = language;
    this.kind = kind;
    this.polls = 0;
    this.showOriginal.set(false);
    this.title.set(null);
    this.description.set(null);

    const cached = this.cache.get(key);
    if (cached) {
      this.apply(cached);
      return;
    }

    this.request();
  }

  /** User pressed "try again": a fresh request (the API still enforces its own cooldown). */
  retry(): void {
    if (!this.propertyId) return;
    this.cancel();
    this.polls = 0;
    this.request();
  }

  toggleOriginal(): void {
    this.showOriginal.update(value => !value);
  }

  /** Forget the listing on screen (navigation to another one, or the page is destroyed). */
  reset(): void {
    this.cancel();
    this.key = '';
    this.propertyId = '';
    this.view.set('none');
    this.showOriginal.set(false);
    this.title.set(null);
    this.description.set(null);
  }

  private request(): void {
    const key = this.key;
    this.view.set('loading');
    this.waitSub = timer(this.options.waitBudgetMs).subscribe(() => {
      if (this.key === key && this.view() === 'loading') this.view.set('waiting');
    });

    this.requestSub = this.api.ensure(this.propertyId, this.language, this.kind).subscribe({
      next: result => {
        if (this.key !== key) return;
        this.waitSub?.unsubscribe();
        this.handle(result);
      },
      error: () => {
        if (this.key !== key) return;
        this.waitSub?.unsubscribe();
        this.view.set('unavailable'); // the listing is unaffected; offline/server trouble simply leaves the original
      }
    });
  }

  private handle(result: ListingTranslation): void {
    if (result.status === 'pending') {
      if (++this.polls > this.options.maxPolls) {
        this.view.set('unavailable');
        return;
      }
      const seconds = Math.min(Math.max(result.retryAfterSeconds ?? 2, 1), 10);
      const key = this.key;
      this.pollSub = timer(seconds * 1000).subscribe(() => {
        if (this.key !== key) return;
        this.requestSub?.unsubscribe();
        this.requestSub = this.api.ensure(this.propertyId, this.language, this.kind).subscribe({
          next: next => { if (this.key === key) this.handle(next); },
          error: () => { if (this.key === key) this.view.set('unavailable'); }
        });
      });
      return; // spinner/"waiting" notice stays; the poll above re-asks
    }

    this.cache.set(this.key, result);
    this.apply(result);
  }

  private apply(result: ListingTranslation): void {
    const title = result.title?.state === 'ready' ? result.title.text ?? null : null;
    const description = result.description?.state === 'ready' ? result.description.text ?? null : null;
    this.title.set(title);
    this.description.set(description);

    if (title || description) {
      this.view.set('ready');
    } else if (result.status === 'same_language') {
      this.view.set('none');
    } else {
      this.view.set('unavailable');
    }
  }

  private cancel(): void {
    this.requestSub?.unsubscribe();
    this.waitSub?.unsubscribe();
    this.pollSub?.unsubscribe();
  }
}
