// =============================================================
// src/app/core/sharing/attribution-context.service.ts
//
// UTM / Attribution (Phase 2) — captures utm_* parameters when a visitor lands on any page and
// remembers them for a configurable window, so a later property view/contact/lead can be
// attributed to "how they actually got here" instead of just "they showed up". Wired at the app
// root (see AppComponent), NOT inside PropertyDetailPage — capture is a whole-app concern, not
// a property-detail concern (same separation-of-concerns rule Phase 1 applied to sharing logic).
//
// Storage: first-party localStorage only (never a cookie, never third-party storage — section
// 16: "لا تستخدم Third-Party Cookies"), with an in-memory fallback for when it's unavailable
// (private browsing, a locked-down Capacitor WebView) so attribution still works for the rest
// of the current page session even then.
//
// Model: last-touch attribution with first-touch retained alongside it (section 9's documented
// default — "Last non-direct click ... مع الاحتفاظ بأول مصدر"). A direct visit (no/invalid
// utm_source) never overwrites existing attribution and never fabricates a fake one.
// =============================================================

import { Injectable, inject } from '@angular/core';
import { UtmAttributionService } from './utm-attribution.service';
import { AttributionContext } from './utm-attribution.model';

interface StoredTouch {
  readonly context: AttributionContext;
  readonly capturedAt: number;
}

interface StoredAttribution {
  readonly firstTouch: StoredTouch;
  readonly lastTouch: StoredTouch;
}

const STORAGE_KEY = 'hudhudnest.attribution.v1';
/** المفتاح القديم من علامة AqarTech قبل إعادة التسمية — يُقرأ مرة واحدة فقط للترحيل. */
const LEGACY_STORAGE_KEY = 'aqartech.attribution.v1';

/**
 * 📌 قرار موثَّق — Attribution Window = 30 days. Long enough that "saw the Facebook share
 * Monday, called the owner Thursday" still attributes correctly; short enough that a link
 * bookmarked months ago doesn't keep claiming credit forever. Configurable in one place — this
 * constant — same pattern as PropertyShareContentService.MAX_SUMMARY_LENGTH elsewhere in this
 * module; not wired to an environment variable since it isn't expected to differ per deploy
 * target.
 */
const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const UTM_QUERY_PARAM_NAMES = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];

@Injectable({ providedIn: 'root' })
export class AttributionContextService {
  private readonly utmAttribution = inject(UtmAttributionService);

  /** In-memory fallback for when localStorage throws or is unavailable — attribution then only
   *  survives the current page session instead of the full window, a documented, acceptable
   *  degradation rather than a hard failure. */
  private memoryFallback: StoredAttribution | null = null;

  /**
   * Reads utm_* parameters from the given URL (defaults to the current page's) and, only when a
   * *valid* utm_source is present, records it as the new last-touch while preserving whatever
   * first-touch is already stored (or seeding it, if this is the first attribution ever seen).
   * A direct visit is a deliberate no-op — never overwrites, never fabricates (section 9: "لا
   * تستبدل Attribution صحيحًا بقيم غير صالحة أو فارغة").
   */
  captureFromUrl(url?: string): void {
    const context = this.utmAttribution.parseAttributionFromUrl(url);
    if (!context) {
      return;
    }

    const now = Date.now();
    const existing = this.readValid(now);
    const touch: StoredTouch = { context, capturedAt: now };

    this.write({
      firstTouch: existing?.firstTouch ?? touch,
      lastTouch: touch
    });
  }

  /** The attribution to attach to "what's happening right now" (a view, a contact click, a
   *  lead) — last-touch, or null once the window has elapsed or nothing was ever captured. A
   *  null here means "direct/organic visit", never an error. */
  getContext(): AttributionContext | null {
    return this.readValid(Date.now())?.lastTouch.context ?? null;
  }

  /** The first attribution captured within the current window — retained per section 9 even
   *  though only last-touch drives event attribution today, so first-touch reporting can be
   *  added later without any capture-side changes. */
  getFirstTouchContext(): AttributionContext | null {
    return this.readValid(Date.now())?.firstTouch.context ?? null;
  }

  /** Test/debug hook, and what a future explicit "forget me" privacy action would call. */
  clear(): void {
    this.memoryFallback = null;
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Storage inaccessible — nothing to clear.
    }
  }

  /**
   * Cosmetic only: removes utm_* parameters from the browser's visible address bar after
   * they've already been captured, leaving every other query parameter untouched. Uses
   * history.replaceState so it does not create a back-button entry or trigger navigation
   * (section 9: "يمكن تنظيف الرابط الظاهر ... بشرط ألا يؤثر ذلك على التحليلات أو المشاركة" —
   * capture above already happened by the time this runs, so it never can).
   */
  stripUtmParamsFromVisibleUrl(): void {
    if (typeof window === 'undefined' || typeof window.history === 'undefined') {
      return;
    }

    try {
      const url = new URL(window.location.href);
      const hadAny = UTM_QUERY_PARAM_NAMES.some(name => url.searchParams.has(name));
      if (!hadAny) {
        return;
      }

      UTM_QUERY_PARAM_NAMES.forEach(name => url.searchParams.delete(name));
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // Non-fatal — the visible URL simply keeps its utm_* params; capture already succeeded.
    }
  }

  private readValid(now: number): StoredAttribution | null {
    const stored = this.read();
    if (!stored) {
      return null;
    }

    if (now - stored.lastTouch.capturedAt > ATTRIBUTION_WINDOW_MS) {
      // Window elapsed — equivalent to a direct visit until a new utm_source is captured.
      this.clear();
      return null;
    }

    return stored;
  }

  private read(): StoredAttribution | null {
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY) ?? this.migrateLegacyAttribution();
      if (raw) {
        return JSON.parse(raw) as StoredAttribution;
      }
    } catch {
      // Fall through to the in-memory fallback below (private browsing, storage disabled, ...).
    }

    return this.memoryFallback;
  }

  /**
   * ترحيل لمرة واحدة من مفتاح AqarTech القديم (LEGACY_STORAGE_KEY) بعد إعادة تسمية
   * العلامة إلى HudhudNest — يحافظ على نافذة الإسناد الحالية للزائر بدل فقدانها فجأة.
   */
  private migrateLegacyAttribution(): string | null {
    try {
      const legacy = window.localStorage?.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        window.localStorage?.setItem(STORAGE_KEY, legacy);
        window.localStorage?.removeItem(LEGACY_STORAGE_KEY);
      }
      return legacy ?? null;
    } catch {
      return null;
    }
  }

  private write(value: StoredAttribution): void {
    this.memoryFallback = value;
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // First-party localStorage unavailable — the in-memory fallback above still makes
      // attribution work for the rest of this page session.
    }
  }
}
