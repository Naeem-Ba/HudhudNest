import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, inject } from '@angular/core';

import { focusFirstError, revealElement, findFirstError, FIELD_ERROR_SELECTOR, findControlFor } from '../../shared/ui/scroll-to-error';

/**
 * "Show me what went wrong": after a failed submit, scrolls to the first error of the page and, when it
 * belongs to a field, focuses that field.
 *
 * Several state changes usually land in the same tick (the request fails, a form-level message is set,
 * two controls get server errors); each calls request(), and only the LAST call acts, once the DOM has
 * rendered the messages. A second call while an earlier one is still pending never produces a second
 * scroll, and a request that arrives while the person is already typing in the field being shown does
 * not move the page.
 *
 * On a phone the keyboard opens when the field takes focus and shrinks the visual viewport a moment
 * later; the position is corrected once more when that happens (for at most 700 ms).
 */
@Injectable({ providedIn: 'root' })
export class AuthErrorFocusService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  private pending: ReturnType<typeof setTimeout> | null = null;
  private keyboardCleanup: (() => void) | null = null;

  request(root: ParentNode = this.document): void {
    if (this.pending !== null) {
      clearTimeout(this.pending);
    }

    // Outside Angular: the timer must not trigger a change-detection pass of its own.
    this.pending = this.zone.runOutsideAngular(() =>
      setTimeout(() => {
        this.pending = null;
        // One more frame so the messages Angular just rendered have their final layout.
        (this.document.defaultView ?? window).requestAnimationFrame(() => this.run(root));
      }, 0)
    );
  }

  private run(root: ParentNode): void {
    const win = this.document.defaultView ?? window;
    const smooth = !win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    this.keyboardCleanup?.();
    this.keyboardCleanup = null;

    const error = focusFirstError(root, { win, smooth });
    if (!error) {
      return;
    }

    this.followKeyboard(win, error, smooth);
  }

  /** The keyboard opens after the focus call: re-check the position once the visual viewport resized. */
  private followKeyboard(win: Window, error: HTMLElement, smooth: boolean): void {
    const vv = win.visualViewport;
    if (!vv) {
      return;
    }

    const control = error.matches(FIELD_ERROR_SELECTOR) ? findControlFor(error) : null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onResize = (): void => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        if (error.isConnected) {
          revealElement(error, control, { win, smooth });
        }
      }, 60);
    };

    vv.addEventListener('resize', onResize);
    const stop = setTimeout(() => this.keyboardCleanup?.(), 700);

    this.keyboardCleanup = () => {
      vv.removeEventListener('resize', onResize);
      clearTimeout(stop);
      if (timer) {
        clearTimeout(timer);
      }
      this.keyboardCleanup = null;
    };
  }

  /** For tests and for pages that want to know whether anything is there to show. */
  hasError(root: ParentNode = this.document): boolean {
    return findFirstError(root) !== null;
  }
}
