// نافذة تأكيد عامة قابلة لإعادة الاستخدام — تُستخدَم في لوحة الإدارة لكل إجراء حسّاس
// (تفعيل/تمديد/إلغاء خطة، تمييز/تمديد إعلان) بدل confirm() الأصلية، لأن هذه الإجراءات
// تحتاج عرض تفاصيل منسَّقة (اسم المستخدم، الخطة، التاريخ الجديد المحسوب) لا مجرد سؤال
// نعم/لا. محتوى النافذة يُمرَّر عبر <ng-content> فيبقى المكوّن عاماً بلا معرفة بالسياق.
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modal-backdrop" *ngIf="open" (click)="onBackdropClick($event)">
      <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <header class="modal__header">
          <h2>{{ title }}</h2>
        </header>

        <div class="modal__body">
          <ng-content></ng-content>
        </div>

        <footer class="modal__footer">
          <button
            *ngIf="!hideCancel"
            type="button"
            class="btn btn--outline"
            (click)="cancelled.emit()"
            [disabled]="loading"
          >
            {{ cancelLabel || ('COMMON.CANCEL' | translate) }}
          </button>
          <button
            type="button"
            class="btn"
            [class.btn--danger]="danger"
            [class.btn--primary]="!danger"
            [disabled]="confirmDisabled || loading"
            (click)="confirmed.emit()"
          >
            {{ loading ? ('COMMON.SAVING' | translate) : (confirmLabel || ('COMMON.CONFIRM' | translate)) }}
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15, 23, 42, .5);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem; z-index: 1000;
    }
    .modal {
      background: var(--surface); border-radius: var(--r-lg, 14px);
      max-width: 460px; width: 100%; max-height: 90vh; max-height: 90dvh; overflow-y: auto;
      box-shadow: 0 20px 50px rgba(0,0,0,.25);
    }
    .modal__header { padding: 1.1rem 1.25rem .5rem; }
    .modal__header h2 {
      margin: 0; color: var(--navy); font-family: var(--font-display); font-size: 1.15rem;
    }
    .modal__body { padding: .5rem 1.25rem 1rem; color: var(--gray-700); line-height: 1.7; }
    .modal__footer {
      display: flex; justify-content: flex-end; gap: .6rem;
      padding: .85rem 1.25rem; border-top: 1px solid var(--border);
    }
    .btn {
      border-radius: var(--r-sm); padding: .5rem 1rem; font-size: var(--text-sm);
      font-weight: 600; cursor: pointer; border: 1px solid transparent;
    }
    .btn:disabled { opacity: .6; cursor: not-allowed; }
    .btn--outline { background: var(--surface); border-color: var(--border); color: var(--navy); }
    .btn--primary { background: var(--primary); color: #fff; }
    .btn--danger { background: var(--danger-soft); color: var(--danger); border-color: rgba(220,38,38,.25); }
  `]
})
export class ConfirmModalComponent implements OnChanges, OnDestroy {
  private readonly scrollLock = inject(ScrollLockService);
  private readonly overlayBackHandlers = inject(OverlayBackHandlerService);
  private unregisterBackHandler: (() => void) | null = null;

  @Input() open = false;
  @Input() title = '';
  @Input() confirmLabel = '';
  @Input() cancelLabel = '';
  @Input() confirmDisabled = false;
  @Input() loading = false;
  @Input() danger = false;
  /** يغلق النافذة بالنقر على الخلفية إلا إذا كانت عملية قيد التنفيذ. */
  @Input() closeOnBackdrop = true;
  /** يخفي زر الإلغاء تماماً — لنافذة لا يمكن تجاوزها (مثل التحديث الإجباري)، مع
   * closeOnBackdrop=false معاً يمنعان أي مسار لإغلاق النافذة سوى زر التأكيد. */
  @Input() hideCancel = false;

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.hold();
      } else {
        this.release();
      }
    }
  }

  ngOnDestroy(): void {
    this.release();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dismiss();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.open) {
      this.dismiss();
    }
  }

  /** Same rule for backdrop, Escape and the hardware Back button: never while busy or for a modal that cannot be skipped. */
  private dismiss(): boolean {
    if (this.closeOnBackdrop && !this.loading) {
      this.cancelled.emit();
    }

    return true;
  }

  // An open modal is a full-screen overlay: the page must not scroll behind it, and Android Back
  // has to close (or at least stay on) the modal instead of leaving the screen underneath it —
  // the same two guarantees the navbar drawer, the filter drawer and the photo gallery already give.
  private hold(): void {
    if (this.unregisterBackHandler) {
      return;
    }

    this.scrollLock.lock();
    this.unregisterBackHandler = this.overlayBackHandlers.register(() => this.open && this.dismiss());
  }

  private release(): void {
    if (!this.unregisterBackHandler) {
      return;
    }

    this.unregisterBackHandler();
    this.unregisterBackHandler = null;
    this.scrollLock.unlock();
  }
}
