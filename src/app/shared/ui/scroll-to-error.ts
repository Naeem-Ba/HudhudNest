/**
 * Brings the first visible error of a form into view and, for a field error, puts the cursor in that
 * field. Pure DOM functions (no Angular) so they are testable with plain fixtures; the Angular wrapper is
 * AuthErrorFocusService.
 *
 * Why not element.scrollIntoView(): it knows nothing about the sticky header (the message ended up under
 * it) or the on-screen keyboard (it ended up under that), and it scrolls the whole page when a field is
 * already visible. Here the visible area is the *visual* viewport (which shrinks when a phone keyboard
 * opens) minus any fixed/sticky header, and nothing moves if the field and its message already fit.
 */

/** A field-level message: next to the field it describes. */
export const FIELD_ERROR_SELECTOR = '[data-form-error], .field-error, .form-error';

/** A message about the form as a whole (wrong credentials, network, server). */
export const FORM_ERROR_SELECTOR = '.auth-alert--error, .alert--error, [data-auth-form-error], p.error';

const CONTROL_SELECTOR = 'input:not([type=hidden]):not([type=checkbox]), select, textarea';

/** Space kept between the revealed element and the edge of the visible area, in px. */
const MARGIN = 16;

export function isVisible(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
}

/**
 * The first error to show: field errors win over the form-level one, because the person can act on a
 * field straight away; among several, the first in document order.
 */
export function findFirstError(root: ParentNode): HTMLElement | null {
  const visible = (selector: string): HTMLElement | null =>
    Array.from(root.querySelectorAll<HTMLElement>(selector)).find(isVisible) ?? null;

  return visible(FIELD_ERROR_SELECTOR) ?? visible(FORM_ERROR_SELECTOR);
}

/** The input an error message belongs to: inside the same `.form-group`, else the closest one before it. */
export function findControlFor(error: HTMLElement): HTMLElement | null {
  const group = error.closest('.form-group');
  if (group) {
    return group.querySelector<HTMLElement>(CONTROL_SELECTOR);
  }

  // <input> + <app-form-error> siblings (the reactive pages): walk back to the nearest control.
  let node: Element | null = error.closest('app-form-error') ?? error;
  while ((node = node.previousElementSibling)) {
    if (node.matches(CONTROL_SELECTOR)) {
      return node as HTMLElement;
    }
    const inner = node.querySelector<HTMLElement>(CONTROL_SELECTOR);
    if (inner) {
      return inner;
    }
    if (node.matches('label')) {
      break;
    }
  }

  return null;
}

/** Height covered by a header that stays at the top of the viewport (fixed or sticky). */
export function stickyTopInset(doc: Document): number {
  let inset = 0;

  doc.querySelectorAll<HTMLElement>('header, nav, [data-sticky-header]').forEach(el => {
    const { position } = getComputedStyle(el);
    if (position !== 'fixed' && position !== 'sticky') {
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.top <= 1 && rect.bottom > 0 && rect.height < (doc.defaultView?.innerHeight ?? 800) / 2) {
      inset = Math.max(inset, rect.bottom);
    }
  });

  return inset;
}

function scrollableAncestor(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== node.ownerDocument.body && node !== node.ownerDocument.documentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export interface RevealOptions {
  win?: Window;
  smooth?: boolean;
}

/**
 * Scrolls just enough for `target` (and `companion`, e.g. the field next to its message) to sit fully
 * inside the visible area. Returns true when it scrolled.
 */
export function revealElement(target: HTMLElement, companion: HTMLElement | null = null, options: RevealOptions = {}): boolean {
  const win = options.win ?? window;
  const vv = win.visualViewport;

  const offsetTop = vv?.offsetTop ?? 0;
  const visibleTop = offsetTop + stickyTopInset(win.document) + MARGIN;
  const visibleBottom = offsetTop + (vv?.height ?? win.innerHeight) - MARGIN;

  const a = target.getBoundingClientRect();
  const b = companion?.getBoundingClientRect() ?? a;
  const top = Math.min(a.top, b.top);
  const bottom = Math.max(a.bottom, b.bottom);

  let delta = 0;
  if (top < visibleTop) {
    delta = top - visibleTop;
  } else if (bottom > visibleBottom) {
    // Never scroll the top of the group out of view just to fit its bottom.
    delta = Math.min(bottom - visibleBottom, top - visibleTop);
  }

  if (Math.abs(delta) < 1) {
    return false;
  }

  // 'instant', not 'auto': 'auto' would still be smooth under a global `scroll-behavior: smooth`, and a
  // reduced-motion visitor asked for no animation at all.
  const behavior: ScrollBehavior = options.smooth === false ? 'instant' : 'smooth';
  const container = scrollableAncestor(target);

  if (container) {
    container.scrollBy({ top: delta, behavior });
  } else {
    win.scrollBy({ top: delta, behavior });
  }

  return true;
}

export interface FocusErrorOptions extends RevealOptions {
  /** Put the cursor in the field a field error belongs to (default true). */
  focusControl?: boolean;
}

/** Reveals the first error of `root`; returns the element it revealed, or null when there is none. */
export function focusFirstError(root: ParentNode, options: FocusErrorOptions = {}): HTMLElement | null {
  const error = findFirstError(root);
  if (!error) {
    return null;
  }

  const isFieldError = error.matches(FIELD_ERROR_SELECTOR);
  const control = isFieldError ? findControlFor(error) : null;

  if (control && options.focusControl !== false) {
    // The page is positioned by revealElement below, so the browser's own jump is suppressed.
    control.focus({ preventScroll: true });
  }

  revealElement(error, control, options);
  return error;
}
