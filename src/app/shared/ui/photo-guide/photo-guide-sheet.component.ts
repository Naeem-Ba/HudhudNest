// دليل تصوير العقار — طبقة UX فوق حقل رفع الصور الحالي. لا يرفع ولا يتحقق من ملفات ولا
// يستدعي API؛ يعرض إرشاداً فقط، ويُصدر `start` ليقرّر المكوّن المضيف (نموذج العقار/الإقامة القصيرة)
// فتح منتقي الملفات الموجود أصلاً. على الهاتف يظهر كـ Bottom Sheet، وعلى الشاشات الكبيرة كحوار مركزي.
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import {
  PHOTO_GUIDE_IMAGES,
  PHOTO_GUIDE_SHOTS,
  PHOTO_GUIDE_TIP_KEYS,
  PhotoGuideKind,
  PhotoGuideShot
} from './photo-guide.data';

@Component({
  selector: 'app-photo-guide-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule],
  templateUrl: './photo-guide-sheet.component.html',
  styleUrl: './photo-guide-sheet.component.scss'
})
export class PhotoGuideSheetComponent {
  readonly open = input(false);
  readonly kind = input<PhotoGuideKind>('rent');

  readonly closed = output<void>();
  /** "ابدأ بإضافة الصور": the host closes the guide and opens its own file picker. */
  readonly start = output<void>();

  private readonly scrollLock = inject(ScrollLockService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  readonly images = PHOTO_GUIDE_IMAGES;
  readonly tipKeys = PHOTO_GUIDE_TIP_KEYS;
  readonly index = signal(0);

  readonly shots = computed<readonly PhotoGuideShot[]>(() => PHOTO_GUIDE_SHOTS[this.kind()]);
  /** The last panel (tips + call to action) sits after the last shot. */
  readonly isFinal = computed(() => this.index() >= this.shots().length);
  readonly currentShot = computed<PhotoGuideShot | null>(() => this.shots()[this.index()] ?? null);

  private locked = false;
  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const isOpen = this.open();
      untracked(() => (isOpen ? this.onOpened() : this.onClosed()));
    });
    this.destroyRef.onDestroy(() => this.onClosed());
  }

  next(): void {
    this.index.update(i => Math.min(i + 1, this.shots().length));
  }

  prev(): void {
    this.index.update(i => Math.max(i - 1, 0));
  }

  goTo(i: number): void {
    this.index.set(Math.max(0, Math.min(i, this.shots().length)));
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      // "Forward" points toward the reading direction: right in LTR, left in RTL.
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      const forward = (event.key === 'ArrowRight') !== rtl;
      forward ? this.next() : this.prev();
      event.preventDefault();
      return;
    }

    if (event.key === 'Tab') this.trapFocus(event);
  }

  private onOpened(): void {
    this.index.set(0);
    this.returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!this.locked) {
      this.scrollLock.lock();
      this.locked = true;
    }
    // The dialog is rendered by the same change detection pass that flipped `open`.
    queueMicrotask(() => this.dialog()?.nativeElement.focus());
  }

  private onClosed(): void {
    if (this.locked) {
      this.scrollLock.unlock();
      this.locked = false;
    }
    this.returnFocusTo?.focus?.();
    this.returnFocusTo = null;
  }

  private trapFocus(event: KeyboardEvent): void {
    const root = this.dialog()?.nativeElement;
    if (!root) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === root)) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && active === last) {
      first.focus();
      event.preventDefault();
    }
  }
}
