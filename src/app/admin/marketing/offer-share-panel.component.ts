// =============================================================
// offer-share-panel.component.ts
//
// "Prepare & share" panel for ONE marketing offer, opened from the admin Offers tab. What it
// really does: builds the share text (ar/en/de) and the public link, and hands them to a
// share-intent channel (device sheet, WhatsApp, Telegram, Facebook dialog) or the clipboard.
// What it does NOT do: publish. Every result message says "dialog opened" / "copied", never
// "published" — a share dialog having opened proves nothing about a post existing. Direct
// publishing through connected company accounts exists only for property listings (the
// "النشر الاجتماعي" tab); offers have no publication pipeline, and this panel says so.
// =============================================================

import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AdminOfferDto } from '../../core/api/admin-marketing.service';
import {
  OFFER_SHARE_LANGUAGES,
  OfferShareLanguage,
  OfferShareService,
} from '../../core/sharing/offer-share.service';
import { ShareableContent, ShareProvider } from '../../core/sharing/share.model';

type PanelNotice = { readonly kind: 'ok' | 'error'; readonly key: string } | null;

@Component({
  selector: 'app-offer-share-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  templateUrl: './offer-share-panel.component.html',
  styleUrls: ['./offer-share-panel.component.scss'],
})
export class OfferSharePanelComponent implements OnInit {
  private readonly shareService = inject(OfferShareService);
  private readonly translate = inject(TranslateService);

  readonly offer = input.required<AdminOfferDto>();
  readonly closed = output<void>();

  readonly languages = OFFER_SHARE_LANGUAGES;
  readonly language = signal<OfferShareLanguage>('ar');
  readonly content = signal<ShareableContent | null>(null);
  readonly notice = signal<PanelNotice>(null);
  readonly busy = signal(false);

  readonly shareable = computed(() => this.shareService.canShare(this.offer()));
  readonly providers: ShareProvider[] = this.shareService.getAvailableProviders();

  // Not the constructor: the required `offer` input is only readable once it has been bound.
  ngOnInit(): void {
    void this.refresh();
  }

  async selectLanguage(language: OfferShareLanguage): Promise<void> {
    this.language.set(language);
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.notice.set(null);
    if (!this.shareable()) {
      this.content.set(null);
      return;
    }

    try {
      this.content.set(await this.shareService.buildContent(this.offer(), this.language()));
    } catch {
      this.content.set(null);
      this.notice.set({ kind: 'error', key: 'OFFER_SHARE.ERROR_BUILD' });
    }
  }

  async shareVia(provider: ShareProvider): Promise<void> {
    if (this.busy() || !this.shareable()) return;

    this.busy.set(true);
    try {
      const result = await this.shareService.shareVia(provider, this.offer(), this.language());
      if (result.cancelled) {
        this.notice.set(null);
      } else if (result.success) {
        // Copy-link has its own wording; every other channel only opened a share dialog.
        this.notice.set({
          kind: 'ok',
          key: result.message ?? 'OFFER_SHARE.DIALOG_OPENED',
        });
      } else {
        this.notice.set({ kind: 'error', key: result.message ?? 'SHARE.ERROR_GENERIC' });
      }
    } catch {
      this.notice.set({ kind: 'error', key: 'SHARE.ERROR_GENERIC' });
    } finally {
      this.busy.set(false);
    }
  }

  async copyText(): Promise<void> {
    const text = this.content()?.text;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      this.notice.set({ kind: 'ok', key: 'OFFER_SHARE.TEXT_COPIED' });
    } catch {
      this.notice.set({ kind: 'error', key: 'SHARE.COPY_LINK_ERROR' });
    }
  }

  noticeText(): string {
    const notice = this.notice();
    return notice ? this.translate.instant(notice.key) : '';
  }

  languageLabel(language: OfferShareLanguage): string {
    switch (language) {
      case 'ar': return 'العربية';
      case 'en': return 'English';
      case 'de': return 'Deutsch';
      default: return 'Türkçe';
    }
  }

  /** The admin page itself is laid out right-to-left whatever the UI language is; this panel's own
   *  chrome follows the language it is displayed in, so English/German text is not mirrored. */
  uiDirection(): 'rtl' | 'ltr' {
    return this.translate.currentLang === 'ar' ? 'rtl' : 'ltr';
  }

  direction(language: OfferShareLanguage): 'rtl' | 'ltr' {
    return language === 'ar' ? 'rtl' : 'ltr';
  }
}
