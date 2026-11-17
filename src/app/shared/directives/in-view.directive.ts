import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject, output } from '@angular/core';

/**
 * Emits once when the element comes within `200px` of the viewport, then stops watching. Without
 * IntersectionObserver (very old WebViews) it emits at once, so the content is never withheld.
 *
 * Used with `@defer (when ...)` rather than `@defer (on viewport)`: Angular's viewport trigger adds ~1.4 kB to the
 * initial bundle of every page, while this lives only in the chunk of the page that uses it.
 */
@Directive({ selector: '[appInView]', standalone: true })
export class InViewDirective implements OnInit, OnDestroy {
  readonly appInView = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      queueMicrotask(() => this.appInView.emit());
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) {
          this.observer?.disconnect();
          this.zone.run(() => this.appInView.emit());
        }
      }, { rootMargin: '200px' });
      this.observer.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
