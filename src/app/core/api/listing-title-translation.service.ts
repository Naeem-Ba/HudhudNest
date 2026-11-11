import { HttpContext } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';

import { SKIP_ERROR_TOAST } from '../interceptors/api-error.interceptor';
import { LanguageService } from '../services/language.service';
import { safeGetItem, safeRemoveItem, safeSetItem } from '../services/safe-storage';
import { BackendApiService } from './backend-api.service';
import { TranslationListingKind, TranslationLanguage } from './listing-translation.service';

/** Mirrors ListingTitleTranslationItemDto / ListingTitleTranslationsDto (camelCase). */
interface TitleItemDto {
  kind: string;
  id: string;
  state: 'ready' | 'pending' | 'same_language' | 'unavailable' | string;
  text?: string | null;
  reason?: string | null;
}

interface TitlesDto {
  targetLanguage: string;
  status: string;
  retryAfterSeconds?: number | null;
  items: TitleItemDto[];
}

interface Entry {
  /** The title the translation was made for; a different current title (edited listing) means "ask again". */
  original: string;
  /** null = nothing to show (already in the visitor's language), remembered so it is not asked again. */
  text: string | null;
}

interface Wanted {
  kind: TranslationListingKind;
  id: string;
  title: string;
  lang: TranslationLanguage;
}

const STORAGE_KEY = 'listing_title_translations_v1';
const SHOW_ORIGINAL_KEY = 'listing_titles_show_original';
/** The API accepts at most this many titles per request (ListingTranslationOptions.MaxTitlesPerRequest). */
const BATCH_SIZE = 30;
const MAX_STORED = 400;
const FLUSH_DELAY_MS = 40;
const MAX_POLLS = 4;

const MINUTE = 60_000;

/**
 * Titles of the listings on screen (home, search results, short-stay list) in the visitor's language.
 *
 * A title that is already known (this device remembers answers, and the API stores them permanently for every
 * visitor) is shown translated at once, with the original one tap away. An unknown title is shown in its
 * original language while ONE batched request per page asks the API for all of them; the answer is kept, so
 * the next visit shows the translation at once. The app never talks to the translation vendor: only the API does,
 * and it can refuse (switched off, monthly limit), in which case the original titles simply stay.
 */
@Injectable({ providedIn: 'root' })
export class ListingTitleTranslationService {
  private readonly api = inject(BackendApiService);
  private readonly languages = inject(LanguageService);

  /** Changes whenever an answer arrives or the original/translated choice flips; templates read it to re-render. */
  private readonly version = signal(0);
  private readonly original = signal(safeGetItem(SHOW_ORIGINAL_KEY) === '1');

  private readonly entries = new Map<string, Entry>();
  private readonly queue = new Map<string, Wanted>();
  private readonly inFlight = new Set<string>();
  private readonly backoff = new Map<string, { until: number; attempts: number }>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.load();
  }

  /** True while the visitor chose to see the original titles. */
  showingOriginal(): boolean {
    this.version();
    return this.original();
  }

  toggleOriginal(): void {
    const next = !this.original();
    this.original.set(next);
    if (next) {
      safeSetItem(SHOW_ORIGINAL_KEY, '1');
    } else {
      safeRemoveItem(SHOW_ORIGINAL_KEY);
    }
    this.version.update(v => v + 1);
  }

  /**
   * The title to show now. Unknown titles are queued for translation and returned unchanged; the template is
   * re-evaluated when the answer arrives (this method reads the `version` signal).
   */
  display(kind: TranslationListingKind, id: string | null | undefined, title: string | null | undefined): string {
    this.version();
    if (!title) {
      return title ?? '';
    }
    if (!id) {
      return title;
    }

    const lang = this.languages.getCurrent();
    const key = this.key(lang, kind, id);
    const entry = this.entries.get(key);
    if (entry && entry.original === title) {
      return entry.text && !this.original() ? entry.text : title;
    }

    this.want({ kind, id, title, lang }, key);
    return title;
  }

  /** True when a translated title exists for this listing in the current language (never asks the API). */
  hasTranslation(kind: TranslationListingKind, id: string | null | undefined, title: string | null | undefined): boolean {
    this.version();
    if (!title || !id) {
      return false;
    }
    const entry = this.entries.get(this.key(this.languages.getCurrent(), kind, id));
    return !!entry && entry.original === title && !!entry.text;
  }

  private want(wanted: Wanted, key: string): void {
    if (this.queue.has(key) || this.inFlight.has(key)) {
      return;
    }
    const wait = this.backoff.get(key);
    if (wait && wait.until > Date.now()) {
      return;
    }

    this.queue.set(key, wanted);
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, FLUSH_DELAY_MS);
    }
  }

  private flush(): void {
    const lang = this.languages.getCurrent();
    // A language switch while titles were waiting: those wishes were for another language.
    for (const [key, wanted] of this.queue) {
      if (wanted.lang !== lang) {
        this.queue.delete(key);
      }
    }
    if (this.queue.size === 0) {
      return;
    }

    const batch = [...this.queue.entries()].slice(0, BATCH_SIZE);
    for (const [key] of batch) {
      this.queue.delete(key);
      this.inFlight.add(key);
    }

    const body = { items: batch.map(([, w]) => ({ kind: w.kind, id: w.id })) };
    this.api
      .post<TitlesDto>(`/listing-translations/titles?lang=${lang}`, body, {
        context: new HttpContext().set(SKIP_ERROR_TOAST, true)
      })
      .subscribe({
        next: dto => this.apply(batch, dto),
        error: () => this.fail(batch, MINUTE)
      });

    if (this.queue.size > 0 && this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, FLUSH_DELAY_MS);
    }
  }

  private apply(batch: [string, Wanted][], dto: TitlesDto): void {
    const answers = new Map<string, TitleItemDto>();
    for (const item of dto?.items ?? []) {
      answers.set(`${item.kind}|${String(item.id).toLowerCase()}`, item);
    }

    let stored = false;
    for (const [key, wanted] of batch) {
      this.inFlight.delete(key);
      const item = answers.get(`${wanted.kind}|${wanted.id.toLowerCase()}`);

      if (item?.state === 'ready' && item.text) {
        this.remember(key, { original: wanted.title, text: item.text });
        this.backoff.delete(key);
        stored = true;
      } else if (item?.state === 'same_language') {
        this.remember(key, { original: wanted.title, text: null });
        this.backoff.delete(key);
        stored = true;
      } else if (item?.state === 'pending') {
        this.poll(key, Math.max(2, dto.retryAfterSeconds ?? 2) * 1000);
      } else {
        // Switched off, monthly limit reached, listing gone, vendor error: keep the original and do not ask
        // again for a while (a long pause when the cause is not going to change within minutes).
        const long = item?.reason === 'disabled' || item?.reason === 'quota';
        this.pause(key, long ? 30 * MINUTE : 10 * MINUTE);
      }
    }

    if (stored) {
      this.save();
    }
    this.version.update(v => v + 1);
  }

  private fail(batch: [string, Wanted][], pauseMs: number): void {
    for (const [key] of batch) {
      this.inFlight.delete(key);
      this.pause(key, pauseMs);
    }
    this.version.update(v => v + 1);
  }

  /** Does not ask again for `waitMs`. The next render after that asks again, so nothing needs a timer. */
  private pause(key: string, waitMs: number): void {
    this.backoff.set(key, { until: Date.now() + waitMs, attempts: 0 });
  }

  /** Another request is translating this title: ask again soon (a few times), then pause for a while. */
  private poll(key: string, waitMs: number): void {
    const attempts = (this.backoff.get(key)?.attempts ?? 0) + 1;
    if (attempts > MAX_POLLS) {
      this.pause(key, 5 * MINUTE);
      return;
    }
    this.backoff.set(key, { until: Date.now() + waitMs, attempts });
    // Nothing else would re-render the list, so the pipe is told to look again when the wait is over.
    setTimeout(() => this.version.update(v => v + 1), waitMs + 50);
  }

  private remember(key: string, entry: Entry): void {
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > MAX_STORED) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }

  private key(lang: string, kind: TranslationListingKind, id: string): string {
    return `${lang}|${kind}|${id.toLowerCase()}`;
  }

  private save(): void {
    try {
      const rows = [...this.entries].map(([key, e]) => [key, e.original, e.text]);
      safeSetItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      // Storage is a convenience only; the next visit simply asks the API again.
    }
  }

  private load(): void {
    try {
      const raw = safeGetItem(STORAGE_KEY);
      const rows: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(rows)) {
        return;
      }
      for (const row of rows.slice(-MAX_STORED)) {
        if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string' && (typeof row[2] === 'string' || row[2] === null)) {
          this.entries.set(row[0], { original: row[1], text: row[2] });
        }
      }
    } catch {
      safeRemoveItem(STORAGE_KEY);
    }
  }
}
