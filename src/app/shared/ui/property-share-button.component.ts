// =============================================================
// src/app/shared/ui/property-share-button.component.ts
//
// Social Sharing & Distribution — the ONLY piece of UI a page needs to add. Self-contained
// like FavoriteToggleButtonComponent: owns the trigger button AND the share sheet, talks only
// to SocialShareService, and shows the user the result. PropertyDetailPage (or any future
// caller) never touches SharePlatform, ShareProvider, encodeURIComponent, the Web Share API,
// or the Clipboard API directly — see docs/social-sharing.md §"Architecture".
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { Property } from '../../core/models/property.model';
import { SocialShareService } from '../../core/sharing/social-share.service';
import { ShareSheetCoordinatorService } from '../../core/sharing/share-sheet-coordinator.service';
import { ShareProvider, SharePlatform, SharePreview } from '../../core/sharing/share.model';
import { PropertyPrintService } from '../../core/print/property-print.service';
import { ToastService } from '../services/toast.service';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';

@Component({
  selector: 'app-property-share-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <button
      type="button"
      class="share-trigger"
      *ngIf="visible()"
      [disabled]="busy()"
      (click)="open()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="sheetOpen()"
      [attr.aria-label]="'SHARE.BUTTON_ARIA' | translate"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M9 11.5V2.5M9 2.5L5.75 5.75M9 2.5l3.25 3.25M4 9.5v4a1.5 1.5 0 001.5 1.5h7a1.5 1.5 0 001.5-1.5v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>

    <div
      class="share-backdrop"
      *ngIf="sheetOpen()"
      (click)="onBackdropClick($event)"
    >
      <div
        #sheet
        class="share-sheet"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'SHARE.SHEET_TITLE' | translate"
        tabindex="-1"
      >
        <span class="share-sheet__grab" aria-hidden="true"></span>
        <header class="share-sheet__header">
          <h2>{{ 'SHARE.SHEET_TITLE' | translate }}</h2>
          <button
            type="button"
            class="share-sheet__close"
            (click)="close()"
            [attr.aria-label]="'COMMON.CLOSE' | translate"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </header>

        <div class="share-preview" *ngIf="preview() as pv">
          <img *ngIf="pv.imageUrl" class="share-preview__img" [src]="pv.imageUrl" alt="" loading="lazy" />
          <div class="share-preview__body">
            <strong class="share-preview__title">{{ pv.title }}</strong>
            <span class="share-preview__price" *ngIf="pv.price">{{ pv.price }}</span>
            <span class="share-preview__loc" *ngIf="pv.location">{{ pv.location }}</span>
          </div>
        </div>

        <label class="share-link__label" for="share-link-field">{{ 'SHARE.LINK_LABEL' | translate }}</label>
        <div class="share-link">
          <input
            id="share-link-field"
            class="share-link__field"
            type="text"
            readonly
            dir="ltr"
            [value]="linkUrl()"
            (focus)="selectAll($event)"
            (click)="selectAll($event)"
          />
          <button
            type="button"
            class="share-link__copy"
            [class.share-link__copy--done]="copied()"
            [disabled]="busyKey() !== null"
            (click)="copyLink()"
          >
            {{ (copied() ? 'SHARE.COPIED' : 'SHARE.COPY_LINK') | translate }}
          </button>
        </div>
        <p class="share-sheet__live" role="status" aria-live="polite">{{ copied() ? ('SHARE.COPY_LINK_SUCCESS' | translate) : '' }}</p>

        <p class="share-sheet__hint">{{ 'SHARE.SHARE_VIA' | translate }}</p>
        <ul class="share-sheet__list">
          <li *ngFor="let provider of appProviders()">
            <button
              type="button"
              class="share-option"
              [disabled]="busyKey() !== null"
              [attr.aria-busy]="busyKey() === provider.labelKey"
              (click)="choose(provider)"
            >
              <span class="share-option__icon" [ngClass]="'share-option__icon--' + iconKey(provider)" aria-hidden="true">
                <ng-container [ngSwitch]="iconKey(provider)">
                  <svg *ngSwitchCase="'whatsapp'" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.200zm4.5-6.1c-.2-.1-1.500-.7-1.700-.8-.2-.1-.4-.1-.6.100l-.8 1c-.1.200-.3.200-.5.100-1.400-.7-2.400-1.300-3.300-2.900-.2-.3.2-.3.700-1.100.1-.2 0-.3 0-.5l-.8-1.900c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.100-.7.300-.7.700-1 1.500-.9 2.400.2 1 .6 1.900 1.300 2.700 1.400 1.800 3.100 2.800 5.300 3.500.7.200 1.300.2 1.800.1.600-.1 1.700-.7 1.900-1.400.2-.7.2-1.200.2-1.400-.1-.1-.3-.2-.6-.3z"/></svg>
                  <svg *ngSwitchCase="'telegram'" viewBox="0 0 24 24" fill="currentColor"><path d="M21.500 3.500L2.700 10.800c-.8.300-.8 1.400 0 1.700l4.700 1.500 1.800 5.600c.2.600 1 .8 1.400.3l2.600-2.600 4.900 3.600c.5.400 1.300.1 1.400-.6l3-15.600c.1-.8-.6-1.400-1-1.200zM9.500 13.500l8.200-5.100-6.500 6.200-.3 3.200-1.400-4.300z"/></svg>
                  <svg *ngSwitchCase="'facebook'" viewBox="0 0 24 24" fill="currentColor"><path d="M13.500 22v-8.200h2.800l.4-3.300h-3.200V8.400c0-.9.300-1.600 1.600-1.600h1.700V3.900c-.3 0-1.300-.1-2.500-.1-2.500 0-4.200 1.500-4.200 4.300v2.400H7.300v3.300h2.800V22h3.400z"/></svg>
                  <svg *ngSwitchCase="'email'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.500 7l8.500 6 8.500-6"/></svg>
                  <svg *ngSwitchDefault viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="6" r="2.500"/><circle cx="18" cy="18" r="2.500"/><path d="M8.200 10.900l7.600-3.800M8.200 13.100l7.600 3.800"/></svg>
                </ng-container>
              </span>
              <span class="share-option__label">{{ provider.labelKey | translate }}</span>
              <span class="share-option__spinner" *ngIf="busyKey() === provider.labelKey" aria-hidden="true"></span>
            </button>
          </li>
        </ul>

        <button type="button" class="share-print" *ngIf="canPrint()" [disabled]="busyKey() !== null" (click)="print()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6M7 18H5a2 2 0 01-2-2v-5a2 2 0 012-2h14a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/></svg>
          {{ 'PRINT.BUTTON' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    /* Same circular icon-button footprint as FavoriteToggleButtonComponent (.fav-btn). */
    .share-trigger {
      width: var(--icon-btn-size, 44px); height: var(--icon-btn-size, 44px);
      border-radius: var(--r-pill, 9999px); padding: 0; flex: none;
      border: 1px solid var(--border, transparent);
      background: var(--surface, rgba(255,255,255,.92)); color: var(--gray-500, #64748b);
      display: grid; place-items: center; cursor: pointer;
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(15,23,42,.08));
      transition: color .15s, transform .1s;
    }
    .share-trigger:hover:not(:disabled) { color: var(--text-strong); }
    .share-trigger:active:not(:disabled) { transform: scale(.92); }
    .share-trigger:focus-visible { outline: 2px solid var(--navy, #0f2742); outline-offset: 2px; }
    .share-trigger:disabled { opacity: .6; cursor: default; }

    .share-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .5);
      display: flex; align-items: flex-end; justify-content: center;
      z-index: 1100; padding: 0;
    }
    .share-sheet {
      background: var(--surface);
      width: 100%; max-width: 480px;
      max-height: 90vh; max-height: 90dvh;
      overflow-y: auto; overscroll-behavior: contain;
      border-radius: var(--r-lg, 16px) var(--r-lg, 16px) 0 0;
      box-shadow: 0 -8px 40px rgba(0,0,0,.25);
      /* Anchored to the bottom edge: keep the last row clear of the iPhone home indicator. */
      padding: .6rem 1.1rem calc(1.25rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
      outline: none;
    }
    @media (min-width: 640px) {
      .share-backdrop { align-items: center; padding: 1rem; }
      .share-sheet { border-radius: var(--r-lg, 16px); padding-top: 1rem; padding-bottom: 1.25rem; }
      .share-sheet__grab { display: none; }
    }
    .share-sheet__grab { display: block; width: 40px; height: 4px; border-radius: 4px; background: var(--border); margin: 0 auto .5rem; }

    .share-sheet__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .5rem; }
    .share-sheet__header h2 { margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--text-strong); }
    .share-sheet__close {
      border: none; background: transparent; color: var(--gray-500); cursor: pointer;
      display: grid; place-items: center; border-radius: var(--r-pill, 999px);
      width: 44px; height: 44px; min-width: 44px; min-height: 44px; padding: 0;
    }
    .share-sheet__close:hover { background: var(--border); }
    .share-sheet__close:focus-visible, .share-link__copy:focus-visible, .share-option:focus-visible, .share-print:focus-visible {
      outline: 2px solid var(--navy, #0f2742); outline-offset: 2px;
    }

    .share-preview { display: flex; gap: .75rem; align-items: center; padding: .6rem; border: 1px solid var(--border); border-radius: var(--r-md, 12px); margin-bottom: .9rem; }
    .share-preview__img { width: 72px; height: 72px; border-radius: 10px; object-fit: cover; flex: none; background: var(--gray-100); }
    .share-preview__body { display: grid; gap: .15rem; min-width: 0; }
    .share-preview__title { color: var(--gray-800, inherit); font-size: .95rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .share-preview__price { color: var(--badge-rent-text, var(--navy)); font-weight: 700; }
    .share-preview__loc { color: var(--gray-500); font-size: var(--text-sm, .875rem); }

    .share-link__label { display: block; font-size: var(--text-sm, .875rem); color: var(--gray-500); margin-bottom: .3rem; }
    .share-link { display: flex; gap: .5rem; align-items: stretch; }
    .share-link__field {
      flex: 1; min-width: 0; min-height: 44px; box-sizing: border-box; padding: 0 .75rem;
      border: 1px solid var(--border); border-radius: var(--r-md, 12px);
      background: var(--gray-100, #f1f5f9); color: var(--gray-800, inherit); font-size: .85rem; text-overflow: ellipsis;
    }
    .share-link__copy {
      flex: none; min-height: 44px; padding: 0 1.1rem; border: 0; cursor: pointer;
      border-radius: var(--r-md, 12px); background: var(--navy, #0f2742); color: #fff; font-weight: 700; font-size: .9rem;
      transition: background-color .15s, transform .1s;
    }
    .share-link__copy:active:not(:disabled) { transform: scale(.97); }
    .share-link__copy--done { background: var(--success, #15803d); }
    .share-link__copy:disabled { opacity: .6; cursor: default; }
    .share-sheet__live { min-height: 1.1rem; margin: .25rem 0 0; font-size: var(--text-sm, .875rem); color: var(--success, #15803d); }

    .share-sheet__hint { color: var(--gray-500); font-size: var(--text-sm, .875rem); margin: .4rem 0 .5rem; }
    .share-sheet__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); gap: .5rem; list-style: none; margin: 0; padding: 0; }
    .share-option {
      width: 100%; min-height: 84px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: .4rem;
      padding: .65rem .35rem; border-radius: var(--r-md, 12px); border: 1px solid var(--border);
      background: var(--surface); color: var(--gray-800, inherit); cursor: pointer;
      font-size: var(--text-sm, .875rem); font-weight: 600; position: relative;
      transition: background-color .15s, transform .1s;
    }
    .share-option:hover:not(:disabled) { background: var(--gray-100, var(--border)); }
    .share-option:active:not(:disabled) { transform: scale(.97); }
    .share-option:disabled { opacity: .55; cursor: not-allowed; }
    .share-option__icon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--gray-100, #f1f5f9); color: var(--text-strong); }
    .share-option__icon svg { width: 22px; height: 22px; }
    .share-option__icon--whatsapp { background: #25d366; color: #fff; }
    .share-option__icon--telegram { background: #229ed9; color: #fff; }
    .share-option__icon--facebook { background: #1877f2; color: #fff; }
    .share-option__label { line-height: 1.2; text-align: center; overflow-wrap: anywhere; }
    .share-option__spinner { position: absolute; inset: 0; border-radius: inherit; background: rgba(255,255,255,.55); }
    html[data-theme="dark"] .share-option__spinner { background: rgba(0,0,0,.4); }

    .share-print {
      width: 100%; min-height: 48px; margin-top: .9rem; display: flex; align-items: center; justify-content: center; gap: .5rem;
      border: 1px solid var(--border); border-radius: var(--r-md, 12px); background: var(--surface);
      color: var(--gray-800, inherit); font-weight: 600; cursor: pointer;
    }
    .share-print:hover:not(:disabled) { background: var(--gray-100, var(--border)); }
    .share-print:disabled { opacity: .55; cursor: not-allowed; }
  `]
})
export class PropertyShareButtonComponent implements OnChanges, OnDestroy {
  private readonly socialShare = inject(SocialShareService);
  private readonly coordinator = inject(ShareSheetCoordinatorService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly printer = inject(PropertyPrintService);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly overlayBackHandlers = inject(OverlayBackHandlerService);
  private unregisterBackHandler: (() => void) | null = null;

  @Input({ required: true }) property!: Property;

  @ViewChild('sheet') private readonly sheetRef?: ElementRef<HTMLElement>;

  private readonly ownerId = Symbol('property-share-button');
  private readonly propertySignal = signal<Property | null>(null);
  private lastFocusedElement: HTMLElement | null = null;

  readonly sheetOpen = signal(false);
  /** labelKey of the option being worked on (null = idle): blocks a second tap while one is in flight. */
  readonly busyKey = signal<string | null>(null);
  readonly busy = computed(() => this.busyKey() !== null);
  /** True for a moment after the link was copied. */
  readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  readonly providers = computed(() => this.socialShare.getAvailableProviders(this.propertySignal()));
  readonly visible = computed(() => this.providers().length > 0);
  /** Everything except "copy link", which has its own field and button above the app grid. */
  readonly appProviders = computed(() => this.providers().filter(p => p.platform !== SharePlatform.CopyLink));
  readonly preview = computed<SharePreview | null>(() => this.socialShare.getPreview(this.propertySignal()));
  readonly linkUrl = computed(() => this.socialShare.getCopyLinkUrl(this.propertySignal()) ?? '');
  readonly canPrint = computed(() => this.printer.canPrint(this.propertySignal()));

  ngOnChanges(): void {
    this.propertySignal.set(this.property ?? null);

    // Defensive: if the property stops being shareable while the sheet happens to be open
    // (e.g. it expired mid-session), close it rather than leave a dead sheet showing.
    if (this.sheetOpen() && !this.visible()) {
      this.close();
    }
  }

  ngOnDestroy(): void {
    if (this.copiedTimer) clearTimeout(this.copiedTimer);
    this.releaseOverlay();
    this.coordinator.release(this.ownerId);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.sheetOpen()) {
      this.close();
    }
  }

  open(): void {
    if (this.busy() || this.sheetOpen() || !this.visible()) {
      return;
    }

    // Only one share sheet may be open across the whole app at a time — see
    // ShareSheetCoordinatorService's doc comment for why this matters even though today only
    // one instance of this component exists per page.
    if (!this.coordinator.tryOpen(this.ownerId)) {
      return;
    }

    this.lastFocusedElement = document.activeElement as HTMLElement | null;
    this.sheetOpen.set(true);

    // A full-screen overlay like the gallery lightbox and the drawers: the page behind it must not
    // scroll, and Android Back closes the sheet instead of leaving the listing.
    this.scrollLock.lock();
    this.unregisterBackHandler = this.overlayBackHandlers.register(() => {
      if (!this.sheetOpen()) {
        return false;
      }

      this.close();
      return true;
    });

    // The sheet enters via *ngIf, so it needs one render cycle to exist in the DOM before it
    // can receive focus — same pattern PropertyDetailPage already uses for scrollToElement.
    setTimeout(() => this.sheetRef?.nativeElement.focus(), 0);
  }

  close(): void {
    if (!this.sheetOpen()) {
      return;
    }

    this.sheetOpen.set(false);
    this.releaseOverlay();
    this.coordinator.release(this.ownerId);
    this.lastFocusedElement?.focus();
    this.lastFocusedElement = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  private releaseOverlay(): void {
    if (!this.unregisterBackHandler) {
      return;
    }

    this.unregisterBackHandler();
    this.unregisterBackHandler = null;
    this.scrollLock.unlock();
  }

  /** Which glyph/brand colour an option gets; unknown providers fall back to the generic share icon. */
  iconKey(provider: ShareProvider): string {
    switch (provider.platform) {
      case SharePlatform.WhatsApp: return 'whatsapp';
      case SharePlatform.Telegram: return 'telegram';
      case SharePlatform.Facebook: return 'facebook';
      case SharePlatform.Other: return 'email';
      default: return 'native';
    }
  }

  selectAll(event: Event): void {
    (event.target as HTMLInputElement | null)?.select();
  }

  async copyLink(): Promise<void> {
    const property = this.propertySignal();
    const copyProvider = this.providers().find(p => p.platform === SharePlatform.CopyLink);
    if (!property || !copyProvider) return;

    await this.run(copyProvider.labelKey, async () => {
      const result = await this.socialShare.shareVia(property, copyProvider);
      if (result.success) {
        this.copied.set(true);
        if (this.copiedTimer) clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => this.copied.set(false), 2500);
        this.toast.success(this.translate.instant(result.message ?? 'SHARE.COPY_LINK_SUCCESS'));
      } else {
        this.toast.error(this.translate.instant(result.message ?? 'SHARE.COPY_LINK_ERROR'));
      }
    });
  }

  async print(): Promise<void> {
    const property = this.propertySignal();
    if (!property) return;

    await this.run('PRINT.BUTTON', async () => {
      const started = await this.printer.print(property);
      if (started) {
        this.close();
      } else {
        this.toast.error(this.translate.instant('PRINT.ERROR'));
      }
    });
  }

  async choose(provider: ShareProvider): Promise<void> {
    const property = this.propertySignal();
    if (!property) return;

    await this.run(provider.labelKey, async () => {
      const result = await this.socialShare.shareVia(property, provider);

      if (result.cancelled) {
        // The user dismissed the native share sheet themselves — not an error, no toast.
        return;
      }

      if (result.success) {
        this.close();
        if (result.message) {
          this.toast.success(this.translate.instant(result.message));
        }
        return;
      }

      this.toast.error(this.translate.instant(result.message ?? 'SHARE.ERROR_GENERIC'));
    });
  }

  /** One action at a time: a rapid second tap while the first is in flight does nothing. */
  private async run(key: string, action: () => Promise<void>): Promise<void> {
    if (this.busyKey() !== null) return;

    this.busyKey.set(key);
    try {
      await action();
    } finally {
      this.busyKey.set(null);
    }
  }
}
