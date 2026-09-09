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
import { ShareProvider, SharePlatform } from '../../core/sharing/share.model';
import { ToastService } from '../services/toast.service';

const PLATFORM_ICON: Record<SharePlatform, string> = {
  [SharePlatform.Native]: '📱',
  [SharePlatform.WhatsApp]: '💬',
  [SharePlatform.Telegram]: '✈️',
  [SharePlatform.Facebook]: '📘',
  [SharePlatform.CopyLink]: '🔗',
  [SharePlatform.Other]: '📷'
};

@Component({
  selector: 'app-property-share-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <button
      type="button"
      class="btn btn--outline share-trigger"
      *ngIf="visible()"
      [disabled]="busy()"
      (click)="open()"
      aria-haspopup="dialog"
      [attr.aria-expanded]="sheetOpen()"
      [attr.aria-label]="'SHARE.BUTTON_ARIA' | translate"
    >
      <span aria-hidden="true">↗</span>
      {{ 'SHARE.BUTTON_LABEL' | translate }}
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
        <header class="share-sheet__header">
          <h2>{{ 'SHARE.SHEET_TITLE' | translate }}</h2>
          <button
            type="button"
            class="share-sheet__close"
            (click)="close()"
            [attr.aria-label]="'COMMON.CLOSE' | translate"
          >✕</button>
        </header>

        <p class="share-sheet__hint">{{ 'SHARE.SHEET_HINT' | translate }}</p>

        <ul class="share-sheet__list">
          <li *ngFor="let provider of providers()">
            <button
              type="button"
              class="share-option"
              [disabled]="busy()"
              [attr.aria-busy]="busyPlatform() === provider.platform"
              (click)="choose(provider)"
            >
              <span class="share-option__icon" aria-hidden="true">{{ iconFor(provider) }}</span>
              <span class="share-option__label">{{ provider.labelKey | translate }}</span>
              <span class="share-option__spinner" *ngIf="busyPlatform() === provider.platform" aria-hidden="true"></span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    .share-trigger { }

    .share-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .5);
      display: flex; align-items: flex-end; justify-content: center;
      z-index: 1100; padding: 0;
    }

    .share-sheet {
      background: var(--surface);
      width: 100%;
      max-width: 480px;
      max-height: 82vh;
      overflow-y: auto;
      border-radius: var(--r-lg, 16px) var(--r-lg, 16px) 0 0;
      box-shadow: 0 -8px 40px rgba(0,0,0,.25);
      padding: 1rem 1.1rem 1.5rem;
      outline: none;
    }

    @media (min-width: 640px) {
      .share-backdrop { align-items: center; padding: 1rem; }
      .share-sheet { border-radius: var(--r-lg, 16px); max-height: 85vh; }
    }

    .share-sheet__header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: .25rem;
    }
    .share-sheet__header h2 {
      margin: 0; font-family: var(--font-display); font-size: 1.1rem; color: var(--navy);
    }
    .share-sheet__close {
      border: none; background: transparent; font-size: 1.1rem; line-height: 1;
      color: var(--gray-500); cursor: pointer; padding: .35rem; border-radius: var(--r-pill, 999px);
      min-width: 32px; min-height: 32px;
    }
    .share-sheet__close:hover { background: var(--border); }

    .share-sheet__hint {
      color: var(--gray-500); font-size: var(--text-sm, .875rem); margin: 0 0 .75rem;
    }

    .share-sheet__list {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: .5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .share-option {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .35rem;
      padding: .85rem .5rem;
      border-radius: var(--r-md, 12px);
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--gray-800, inherit);
      cursor: pointer;
      font-size: var(--text-sm, .875rem);
      font-weight: 600;
      position: relative;
      transition: background-color .15s, transform .1s;
    }
    .share-option:hover:not(:disabled) { background: var(--border); }
    .share-option:active:not(:disabled) { transform: scale(.97); }
    .share-option:disabled { opacity: .55; cursor: not-allowed; }
    .share-option__icon { font-size: 1.5rem; line-height: 1; }
    .share-option__label { line-height: 1.2; text-align: center; }
    .share-option__spinner {
      position: absolute; inset: 0; border-radius: inherit;
      background: rgba(255,255,255,.55);
    }
    html[data-theme="dark"] .share-option__spinner { background: rgba(0,0,0,.4); }
  `]
})
export class PropertyShareButtonComponent implements OnChanges, OnDestroy {
  private readonly socialShare = inject(SocialShareService);
  private readonly coordinator = inject(ShareSheetCoordinatorService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  @Input({ required: true }) property!: Property;

  @ViewChild('sheet') private readonly sheetRef?: ElementRef<HTMLElement>;

  private readonly ownerId = Symbol('property-share-button');
  private readonly propertySignal = signal<Property | null>(null);
  private lastFocusedElement: HTMLElement | null = null;

  readonly sheetOpen = signal(false);
  readonly busy = signal(false);
  readonly busyPlatform = signal<SharePlatform | null>(null);

  readonly providers = computed(() => this.socialShare.getAvailableProviders(this.propertySignal()));
  readonly visible = computed(() => this.providers().length > 0);

  ngOnChanges(): void {
    this.propertySignal.set(this.property ?? null);

    // Defensive: if the property stops being shareable while the sheet happens to be open
    // (e.g. it expired mid-session), close it rather than leave a dead sheet showing.
    if (this.sheetOpen() && !this.visible()) {
      this.close();
    }
  }

  ngOnDestroy(): void {
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

    // The sheet enters via *ngIf, so it needs one render cycle to exist in the DOM before it
    // can receive focus — same pattern PropertyDetailPage already uses for scrollToElement.
    setTimeout(() => this.sheetRef?.nativeElement.focus(), 0);
  }

  close(): void {
    if (!this.sheetOpen()) {
      return;
    }

    this.sheetOpen.set(false);
    this.coordinator.release(this.ownerId);
    this.lastFocusedElement?.focus();
    this.lastFocusedElement = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  iconFor(provider: ShareProvider): string {
    return PLATFORM_ICON[provider.platform] ?? '🔗';
  }

  async choose(provider: ShareProvider): Promise<void> {
    // Prevents double-submission from a rapid double-tap while the first attempt is still
    // in flight (e.g. Web Share API's promise pending, or the clipboard write in progress).
    if (this.busy()) {
      return;
    }

    const property = this.propertySignal();
    if (!property) {
      return;
    }

    this.busy.set(true);
    this.busyPlatform.set(provider.platform);

    try {
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
    } finally {
      this.busy.set(false);
      this.busyPlatform.set(null);
    }
  }
}
