// =============================================================
// src/app/shared/ui/report-listing-button.component.ts
//
// "Report this listing": the flag button and its dialog in one self-contained piece, like
// PropertyShareButtonComponent. Any page that shows a listing adds
//   <app-report-listing-button [propertyId]="p.id" [ownerId]="p.ownerId" />
// and nothing else. The server decides everything that matters (the listing, its owner, priority,
// duplicates, limits); this component only collects the reason and the details and shows the result.
// Signed-in users only: a visitor is sent to sign in and back.
// =============================================================

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  input,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ListingReportsService } from '../../core/api/listing-reports.service';
import { AuthService } from '../../core/auth/auth.service';
import {
  LISTING_REPORT_REASONS,
  ListingReportReason,
  ListingReportReasonDto,
  MyListingReportDto,
  MyOpenReportStatusDto
} from '../../core/models/listing-report.model';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';
import { ToastService } from '../services/toast.service';

type Phase = 'checking' | 'form' | 'already' | 'done';

const FALLBACK_REASONS: ListingReportReasonDto[] = LISTING_REPORT_REASONS.map(code => ({
  code,
  requiresDetails: code === 'Other',
  maxDetailsLength: 2000
}));

@Component({
  selector: 'app-report-listing-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <button
      type="button"
      class="report-trigger"
      [class.report-trigger--compact]="variant() === 'compact'"
      *ngIf="visible()"
      (click)="onTrigger($event)"
      aria-haspopup="dialog"
      [attr.aria-expanded]="sheetOpen()"
      [attr.aria-label]="'REPORT.BUTTON_ARIA' | translate"
      [attr.title]="'REPORT.BUTTON' | translate"
      data-testid="report-listing-button"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M4 16V2.5M4 3h8.2c.5 0 .8.5.5.9L11 6.5l1.7 2.600c.3.400 0 .900-.500.900H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="report-trigger__label" *ngIf="variant() === 'labeled'">{{ 'REPORT.BUTTON' | translate }}</span>
    </button>

    <div class="report-backdrop" *ngIf="sheetOpen()" (click)="onBackdropClick($event)">
      <div #sheet class="report-sheet" role="dialog" aria-modal="true" tabindex="-1"
           [attr.aria-labelledby]="'report-title-' + uid" data-testid="report-dialog">
        <span class="report-sheet__grab" aria-hidden="true"></span>
        <header class="report-sheet__header">
          <h2 [id]="'report-title-' + uid">{{ 'REPORT.TITLE' | translate }}</h2>
          <button type="button" class="report-sheet__close" (click)="close()" [disabled]="busy()"
                  [attr.aria-label]="'COMMON.CLOSE' | translate">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </header>

        <ng-container [ngSwitch]="phase()">
          <p *ngSwitchCase="'checking'" class="report-muted" role="status">{{ 'COMMON.LOADING' | translate }}</p>

          <!-- Already reported, still open -->
          <div *ngSwitchCase="'already'" data-testid="report-already">
            <p class="report-notice report-notice--info" role="status">
              {{ 'REPORT.ALREADY_OPEN' | translate: { ref: open()?.referenceNumber } }}
            </p>
            <ng-container *ngIf="needsReply(); else plainHint">
              <p class="report-notice report-notice--warn" role="alert" data-testid="report-needs-reply">
                {{ 'REPORT.NEEDS_REPLY' | translate }}
              </p>
              <div class="report-actions">
                <button type="button" class="report-btn" (click)="close()">{{ 'COMMON.CLOSE' | translate }}</button>
                <button type="button" class="report-btn report-btn--primary" (click)="goReply()" data-testid="report-reply-now">
                  {{ 'REPORT.REPLY_NOW' | translate }}
                </button>
              </div>
            </ng-container>
            <ng-template #plainHint>
              <p class="report-muted">{{ 'REPORT.ALREADY_OPEN_HINT' | translate }}</p>
              <div class="report-actions">
                <button type="button" class="report-btn report-btn--primary" (click)="close()">{{ 'COMMON.CLOSE' | translate }}</button>
              </div>
            </ng-template>
          </div>

          <!-- Result -->
          <div *ngSwitchCase="'done'" data-testid="report-success">
            <p class="report-notice report-notice--ok" role="status">
              {{ 'REPORT.SUCCESS' | translate: { ref: created()?.referenceNumber } }}
            </p>
            <p class="report-muted">{{ 'REPORT.SUCCESS_HINT' | translate }}</p>
            <div class="report-actions">
              <button type="button" class="report-btn report-btn--primary" (click)="close()">{{ 'COMMON.CLOSE' | translate }}</button>
            </div>
          </div>

          <form *ngSwitchCase="'form'" (ngSubmit)="submit()" novalidate>
            <p class="report-muted">{{ 'REPORT.INTRO' | translate }}</p>
            <p class="report-listing" *ngIf="listingLabel() as label">
              <span class="report-listing__label">{{ 'REPORT.LISTING' | translate }}</span>
              <strong>{{ label }}</strong>
            </p>

            <fieldset class="report-reasons" [disabled]="busy()">
              <legend>{{ 'REPORT.REASON_LABEL' | translate }}</legend>
              <label class="report-reason" *ngFor="let r of reasons()" [class.report-reason--on]="reason() === r.code">
                <input type="radio" name="reason" [value]="r.code" [ngModel]="reason()" (ngModelChange)="reason.set($event)">
                <span>{{ 'REPORT.REASON.' + r.code | translate }}</span>
              </label>
            </fieldset>
            <p class="report-error" role="alert" *ngIf="showReasonError()">{{ 'REPORT.ERR_REASON' | translate }}</p>

            <label class="report-field" [attr.for]="'report-details-' + uid">
              {{ 'REPORT.DETAILS_LABEL' | translate }}
              <span class="report-muted" *ngIf="!detailsRequired()">({{ 'REPORT.OPTIONAL' | translate }})</span>
            </label>
            <textarea [id]="'report-details-' + uid" name="details" rows="4" [maxLength]="maxDetails()"
                      [ngModel]="details()" (ngModelChange)="details.set($event)" [disabled]="busy()"
                      [placeholder]="'REPORT.DETAILS_PLACEHOLDER' | translate"></textarea>
            <div class="report-counter report-muted">{{ details().length }} / {{ maxDetails() }}</div>
            <p class="report-error" role="alert" *ngIf="showDetailsError()">{{ 'REPORT.ERR_DETAILS' | translate }}</p>

            <p class="report-privacy report-muted">{{ 'REPORT.PRIVACY' | translate }}</p>

            <p class="report-notice report-notice--error" role="alert" *ngIf="errorKey() as key" data-testid="report-error">
              {{ key | translate }}
            </p>

            <div class="report-actions">
              <button type="button" class="report-btn" (click)="close()" [disabled]="busy()">{{ 'COMMON.CANCEL' | translate }}</button>
              <button type="submit" class="report-btn report-btn--primary" [disabled]="busy()" [attr.aria-busy]="busy()"
                      data-testid="report-submit">
                {{ (busy() ? 'REPORT.SENDING' : 'REPORT.SUBMIT') | translate }}
              </button>
            </div>
          </form>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    /* Same circular icon-button footprint as the favorite and share buttons. */
    .report-trigger {
      box-sizing: border-box; width: var(--icon-btn-size, 44px); height: var(--icon-btn-size, 44px);
      min-width: var(--icon-btn-size, 44px); min-height: var(--icon-btn-size, 44px);
      border-radius: var(--r-pill, 9999px); padding: 0; flex: none; gap: .4rem;
      border: 1px solid var(--border, transparent);
      background: var(--surface, rgba(255,255,255,.92)); color: var(--gray-500, #64748b);
      display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      box-shadow: var(--shadow-sm, 0 2px 8px rgba(15,23,42,.08));
      transition: color .15s, transform .1s;
    }
    .report-trigger:hover { color: var(--danger, #dc2626); }
    .report-trigger:active { transform: scale(.92); }
    .report-trigger:focus-visible { outline: 2px solid var(--navy, #0f2742); outline-offset: 2px; }
    .report-trigger--compact { width: 36px; height: 36px; min-width: 36px; min-height: 36px; background: rgba(255,255,255,.92); }
    .report-trigger__label { font-size: var(--text-sm, .875rem); font-weight: 600; }

    .report-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .5);
      display: flex; align-items: flex-end; justify-content: center; z-index: 1100;
      /* The dialog lives inside whatever card hosts the button: do not inherit that card's text styling
         (a card that sets line-height: 0 collapsed every paragraph here). */
      line-height: 1.5; font-size: 1rem; font-weight: 400; letter-spacing: normal; white-space: normal;
      text-transform: none; color: var(--gray-900, inherit);
    }
    .report-sheet {
      background: var(--surface); width: 100%; max-width: 520px;
      max-height: 92vh; max-height: 92dvh; overflow-y: auto; overscroll-behavior: contain;
      border-radius: var(--r-lg, 16px) var(--r-lg, 16px) 0 0; box-shadow: 0 -8px 40px rgba(0,0,0,.25);
      padding: .6rem 1.1rem calc(1.25rem + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
      outline: none; text-align: start; cursor: default;
    }
    @media (min-width: 640px) {
      .report-backdrop { align-items: center; padding: 1rem; }
      .report-sheet { border-radius: var(--r-lg, 16px); padding-top: 1rem; }
      .report-sheet__grab { display: none; }
    }
    .report-sheet__grab { display: block; width: 40px; height: 4px; border-radius: 4px; background: var(--border); margin: 0 auto .5rem; }
    .report-sheet__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: .4rem; }
    .report-sheet__header h2 { margin: 0; font-family: var(--font-display); font-size: 1.15rem; color: var(--navy); }
    .report-sheet__close {
      border: none; background: transparent; color: var(--gray-500); cursor: pointer; display: grid; place-items: center;
      border-radius: var(--r-pill, 999px); width: 44px; height: 44px; padding: 0;
    }
    .report-sheet__close:hover:not(:disabled) { background: var(--border); }
    .report-sheet__close:disabled { opacity: .5; cursor: default; }

    .report-muted { color: var(--gray-500); font-size: var(--text-sm, .875rem); margin: .25rem 0; }
    .report-listing { display: grid; gap: .1rem; margin: .6rem 0; padding: .6rem .75rem; border: 1px solid var(--border); border-radius: var(--r-md, 12px); background: var(--gray-100, #f1f5f9); }
    .report-listing__label { font-size: .78rem; color: var(--gray-500); }
    .report-listing strong { overflow-wrap: anywhere; color: var(--gray-800, inherit); }
    .report-reasons { border: 0; padding: 0; margin: .5rem 0; display: grid; gap: .35rem; min-width: 0; }
    .report-reasons legend { font-weight: 700; color: var(--gray-800, inherit); margin-bottom: .3rem; padding: 0; }
    .report-reason {
      display: flex; gap: .6rem; align-items: center; min-height: 44px; padding: .4rem .75rem; cursor: pointer;
      border: 1px solid var(--border); border-radius: var(--r-md, 12px); background: var(--surface);
    }
    .report-reason--on { border-color: var(--primary, #0f2742); background: var(--primary-soft, rgba(15,39,66,.06)); }
    .report-reason input { accent-color: var(--primary, #0f2742); width: 18px; height: 18px; flex: none; }
    .report-field { display: block; font-weight: 700; margin-top: .6rem; color: var(--gray-800, inherit); }
    textarea {
      width: 100%; box-sizing: border-box; border: 1px solid var(--border); border-radius: var(--r-md, 12px);
      padding: .6rem .75rem; font: inherit; font-size: 16px; background: var(--surface); color: var(--gray-900, inherit); resize: vertical;
    }
    textarea:focus-visible { outline: 2px solid var(--navy, #0f2742); outline-offset: 1px; }
    .report-counter { text-align: end; margin-top: .15rem; }
    .report-privacy { margin-top: .5rem; }
    .report-error { color: var(--danger, #dc2626); font-size: var(--text-sm, .875rem); margin: .2rem 0; }
    .report-notice { padding: .7rem .9rem; border-radius: var(--r-md, 12px); margin: .5rem 0; overflow-wrap: anywhere; }
    .report-notice--ok { background: var(--success-soft, #dcfce7); color: var(--success, #15803d); }
    .report-notice--warn { background: var(--warning-soft, #fef3c7); color: var(--warning, #92400e); }
    .report-notice--info { background: var(--primary-soft, #e0e7ff); color: var(--primary-text, #1e3a8a); }
    .report-notice--error { background: var(--danger-soft, #fee2e2); color: var(--danger, #b91c1c); }
    .report-actions { display: flex; gap: .6rem; justify-content: flex-end; margin-top: .9rem; flex-wrap: wrap; }
    .report-btn {
      min-height: 44px; padding: 0 1.2rem; border-radius: var(--r-md, 12px); border: 1px solid var(--border);
      background: var(--surface); color: var(--navy, #0f2742); font: inherit; font-weight: 700; cursor: pointer;
    }
    .report-btn--primary { background: var(--primary, #0f2742); color: var(--on-primary, #fff); border-color: transparent; }
    .report-btn:disabled { opacity: .6; cursor: not-allowed; }
    .report-btn:focus-visible { outline: 2px solid var(--navy, #0f2742); outline-offset: 2px; }
  `]
})
export class ReportListingButtonComponent implements OnDestroy {
  private readonly api = inject(ListingReportsService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly overlayBackHandlers = inject(OverlayBackHandlerService);
  private unregisterBackHandler: (() => void) | null = null;
  private lastFocused: HTMLElement | null = null;

  /** The listing being reported. The server re-reads everything else from it. */
  readonly propertyId = input.required<string>();
  /** Hides the button for the owner (the server refuses it anyway). */
  readonly ownerId = input<string | null | undefined>(null);
  /** Shown in the dialog so the person knows which listing this is. */
  readonly listingTitle = input<string | null | undefined>(null);
  /** icon: round like favorite/share; compact: small round, for cards; labeled: icon + text. */
  readonly variant = input<'icon' | 'compact' | 'labeled'>('icon');

  @ViewChild('sheet') private readonly sheetRef?: ElementRef<HTMLElement>;

  readonly uid = Math.random().toString(36).slice(2, 8);
  readonly sheetOpen = signal(false);
  readonly phase = signal<Phase>('checking');
  readonly busy = signal(false);
  readonly reasons = signal<ListingReportReasonDto[]>(FALLBACK_REASONS);
  readonly reason = signal<ListingReportReason | null>(null);
  readonly details = signal('');
  readonly submitted = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly open = signal<MyOpenReportStatusDto | null>(null);
  readonly created = signal<MyListingReportDto | null>(null);
  private clientRequestId = '';

  readonly visible = computed(() => {
    const owner = this.ownerId();
    return !(owner && owner === this.auth.getCurrentUserId());
  });
  readonly listingLabel = computed(() => {
    const title = this.listingTitle()?.trim();
    // The id is what an admin can search for; the short form is enough to tell two listings apart.
    const shortId = `#${this.propertyId().slice(0, 8)}`;
    return title ? `${title} · ${shortId}` : shortId;
  });
  private readonly selected = computed(() => this.reasons().find(r => r.code === this.reason()) ?? null);
  readonly detailsRequired = computed(() => this.selected()?.requiresDetails ?? false);
  readonly maxDetails = computed(() => this.selected()?.maxDetailsLength ?? 2000);
  readonly showReasonError = computed(() => this.submitted() && !this.reason());
  readonly showDetailsError = computed(() =>
    this.submitted() && this.detailsRequired() && this.details().trim().length < 10);

  ngOnDestroy(): void {
    this.releaseOverlay();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.sheetOpen() && !this.busy()) this.close();
  }

  onTrigger(event: Event): void {
    // The button sits inside clickable cards: opening the dialog must not also open the listing.
    event.stopPropagation();
    event.preventDefault();

    if (!this.auth.getAccessToken()) {
      this.toast.info(this.translate.instant('REPORT.LOGIN_REQUIRED'));
      void this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.openSheet();
  }

  private openSheet(): void {
    if (this.sheetOpen()) return;

    this.lastFocused = document.activeElement as HTMLElement | null;
    this.reason.set(null);
    this.details.set('');
    this.submitted.set(false);
    this.errorKey.set(null);
    this.created.set(null);
    this.busy.set(false);
    this.phase.set('checking');
    this.clientRequestId = newClientRequestId();
    this.sheetOpen.set(true);

    this.scrollLock.lock();
    this.unregisterBackHandler = this.overlayBackHandlers.register(() => {
      if (!this.sheetOpen()) return false;
      if (!this.busy()) this.close();
      return true;
    });
    setTimeout(() => this.sheetRef?.nativeElement.focus(), 0);

    // Reasons come from the server (so a new reason appears without an app release); the built-in
    // list is the fallback if that request fails. Then: does this person already have an open report?
    this.api.reasons().subscribe({
      next: list => { if (list?.length) this.reasons.set(list); },
      error: () => this.reasons.set(FALLBACK_REASONS)
    });
    this.api.openFor(this.propertyId()).subscribe({
      next: status => {
        this.open.set(status);
        this.phase.set(status.hasOpenReport ? 'already' : 'form');
      },
      // If the check fails the form still works: the server enforces the rule on submit.
      error: () => this.phase.set('form')
    });
  }

  /** The team asked this person a question and is waiting: the dialog must lead them to the answer box. */
  needsReply(): boolean {
    return this.open()?.status === 'NeedsYourInfo' && !!this.open()?.reportId;
  }

  goReply(): void {
    const id = this.open()?.reportId;
    this.close();
    if (id) void this.router.navigate(['/my-reports', id]);
  }

  close(): void {
    if (!this.sheetOpen() || this.busy()) return;
    this.sheetOpen.set(false);
    this.releaseOverlay();
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  submit(): void {
    if (this.busy()) return;
    this.submitted.set(true);
    this.errorKey.set(null);

    const reason = this.reason();
    if (!reason || this.showDetailsError()) return;

    this.busy.set(true);
    this.api.submit({
      propertyId: this.propertyId(),
      reason,
      details: this.details().trim() || null,
      clientRequestId: this.clientRequestId
    }).subscribe({
      next: report => {
        this.created.set(report);
        this.phase.set('done');
        this.busy.set(false);
      },
      error: err => {
        this.busy.set(false);
        this.handleError(err);
      }
    });
  }

  private handleError(err: unknown): void {
    const status = (err as { status?: number } | null)?.status ?? 0;
    const code = (err as { error?: { code?: string } } | null)?.error?.code;

    if (status === 401) {
      this.errorKey.set('REPORT.ERR_SESSION');
      return;
    }
    if (status === 404) { this.errorKey.set('REPORT.ERR_LISTING_GONE'); return; }
    if (status === 409) {
      this.errorKey.set(({
        REPORT_OWN_LISTING: 'REPORT.ERR_OWN_LISTING',
        REPORT_ALREADY_OPEN: 'REPORT.ERR_ALREADY_OPEN',
        REPORT_RECENTLY_REVIEWED: 'REPORT.ERR_RECENTLY_REVIEWED'
      } as Record<string, string>)[code ?? ''] ?? 'REPORT.ERR_GENERIC');
      return;
    }
    if (status === 429) { this.errorKey.set('REPORT.ERR_RATE'); return; }
    if (status === 400 || status === 422) { this.errorKey.set('REPORT.ERR_INVALID'); return; }
    this.errorKey.set(status === 0 ? 'REPORT.ERR_NETWORK' : 'REPORT.ERR_GENERIC');
  }

  private releaseOverlay(): void {
    if (!this.unregisterBackHandler) return;
    this.unregisterBackHandler();
    this.unregisterBackHandler = null;
    this.scrollLock.unlock();
  }
}

function newClientRequestId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}
