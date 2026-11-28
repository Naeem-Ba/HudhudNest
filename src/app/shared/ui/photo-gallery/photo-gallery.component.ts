import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, afterNextRender, computed, effect,
  inject, input, signal, viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { OverlayBackHandlerService } from '../../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { UrlService } from '../../../core/services/url.service';
import { ImageFallbackDirective } from '../../directives/image-fallback.directive';
import { getGallerySwipeNavigation } from './gallery-swipe';

/** One photo of a listing; `alt` is the owner's description when there is one. */
export interface GalleryImage {
  url: string;
  alt?: string | null;
}

const FALLBACK_IMAGE = '/images/no-image.svg';
/** Widths requested from Cloudinary (c_limit: scaled down only, never cropped, never upscaled). */
const HERO_WIDTHS = [480, 768, 1024, 1440, 1920] as const;
const HERO_FALLBACK_WIDTH = 1024;
const TILE_WIDTH = 640;
const THUMB_WIDTH = 160;
const LIGHTBOX_WIDTHS = [1024, 1600, 2048] as const;
const LIGHTBOX_FALLBACK_WIDTH = 1600;
/**
 * Whether a photo may fill its frame (object-fit: cover) without losing anything that matters: only when its
 * proportions are within ~20% of the frame's, so the crop is a sliver. Anything else is shown whole (contain),
 * so a tall room shot or a panorama is never cut to a strip.
 */
export function photoMayFillFrame(photoRatio: number, frameRatio: number, tolerance = 1.2): boolean {
  if (!(photoRatio > 0) || !(frameRatio > 0) || !Number.isFinite(photoRatio) || !Number.isFinite(frameRatio)) return false;
  const off = photoRatio > frameRatio ? photoRatio / frameRatio : frameRatio / photoRatio;
  return off <= tolerance;
}

/** How many photos the desktop mosaic shows; the rest are one tap away in the viewer. */
export const MOSAIC_TILES = 5;

/**
 * Photo gallery shared by the property and short-stay detail pages.
 *
 * - Narrow container (phone): a native horizontal scroll-snap carousel with an "n / total" counter. The
 *   browser owns the swipe, so vertical page scrolling, momentum and RTL all behave natively.
 * - Wide container: a mosaic (large first photo + up to four more) and a "view all photos" button.
 *   The switch follows the width of the gallery's own box (container query), not the viewport.
 * - Tapping a photo opens a full-screen viewer: swipe, previous/next buttons, arrow keys, Escape,
 *   thumbnails, focus trap, background scroll lock and Android back-button support.
 *
 * Photos are never cropped in the carousel, the first mosaic tile or the viewer (object-fit: contain), so
 * windows, balconies and room proportions stay visible; only the small mosaic tiles crop, as previews.
 */
@Component({
  selector: 'app-photo-gallery',
  standalone: true,
  imports: [TranslateModule, ImageFallbackDirective],
  templateUrl: './photo-gallery.component.html',
  styleUrl: './photo-gallery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhotoGalleryComponent {
  readonly images = input<readonly GalleryImage[]>([]);
  /** Listing title, used to describe photos that have no description of their own. */
  readonly title = input('');

  private readonly urlService = inject(UrlService);
  private readonly translate = inject(TranslateService);
  private readonly scrollLock = inject(ScrollLockService);
  private readonly overlayBackHandler = inject(OverlayBackHandlerService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly thumbStrip = viewChild<ElementRef<HTMLElement>>('thumbStrip');
  private readonly viewerRoot = viewChild<ElementRef<HTMLElement>>('viewer');

  /** Valid photos only, without duplicates of the same URL. */
  readonly items = computed<GalleryImage[]>(() => {
    const seen = new Set<string>();
    const result: GalleryImage[] = [];
    for (const image of this.images() ?? []) {
      const url = image?.url?.trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push({ url, alt: image.alt });
    }
    return result;
  });
  readonly count = computed(() => this.items().length);
  readonly tileCount = computed(() => Math.min(this.count(), MOSAIC_TILES));
  /** The photo shown in the carousel and the viewer (0-based). */
  readonly index = signal(0);
  readonly viewerOpen = signal(false);
  readonly lang = signal(this.translate.currentLang || 'ar');

  private returnFocus?: HTMLElement;
  private swipeStart?: { id: number; x: number; y: number };
  private scrollFrame = 0;

  constructor() {
    this.translate.onLangChange.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(e => this.lang.set(e.lang));

    // A listing with fewer photos than the current position (the page was reused for another listing).
    effect(() => {
      if (this.index() > Math.max(0, this.count() - 1)) this.index.set(0);
    });

    // Warm the browser cache with the neighbours of the open photo so stepping is instant.
    effect(() => {
      if (!this.viewerOpen()) return;
      const items = this.items();
      const i = this.index();
      for (const neighbour of [items[i + 1], items[i - 1]]) {
        if (neighbour) new Image().src = this.viewerSrc(neighbour);
      }
    });

    // The viewer is a full-screen layer: it lives directly under <body> while open, otherwise a stacking
    // context of the page (or the sticky navbar, which sits above the page content) can end up on top of it
    // and swallow taps on its buttons. Angular still owns the node and removes it when it closes.
    effect(() => {
      const root = this.viewerRoot()?.nativeElement;
      if (root && root.parentElement !== document.body) document.body.appendChild(root);
    });

    // Keep the highlighted thumbnail in view.
    effect(() => {
      if (!this.viewerOpen()) return;
      const i = this.index();
      queueMicrotask(() => {
        const active = this.thumbStrip()?.nativeElement.querySelector<HTMLElement>(`[data-index="${i}"]`);
        active?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
      });
    });

    const unregisterBack = this.overlayBackHandler.register(() => {
      if (!this.viewerOpen()) return false;
      this.closeViewer();
      return true;
    });
    this.destroyRef.onDestroy(() => {
      unregisterBack();
      if (this.scrollFrame) cancelAnimationFrame(this.scrollFrame);
      this.scrollLock.forceUnlockIfHeldBy(this.viewerOpen());
      // Angular does not remove nodes of a destroyed component one by one, and the viewer is no longer inside
      // the host, so it has to be taken out of <body> here.
      this.viewerRoot()?.nativeElement.remove();
    });

    afterNextRender(() => {
      this.syncTrack();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => this.fitAll());
      const track = this.track()?.nativeElement;
      if (track) observer.observe(track);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Chooses fill or whole-photo for one hero image once its size is known (and again when the frame resizes). */
  fitImage(img: HTMLImageElement): void {
    const frame = img.parentElement?.getBoundingClientRect();
    if (!frame || frame.width === 0 || frame.height === 0 || !img.naturalWidth || !img.naturalHeight) return;
    img.classList.toggle('pg__img--fill', photoMayFillFrame(img.naturalWidth / img.naturalHeight, frame.width / frame.height));
  }

  private fitAll(): void {
    this.track()?.nativeElement.querySelectorAll<HTMLImageElement>('.pg__img').forEach(img => this.fitImage(img));
  }

  isRtl(): boolean {
    return this.lang() === 'ar' || document.documentElement.dir === 'rtl';
  }

  // ── Image URLs ──────────────────────────────────────────────────────
  heroSrc(image: GalleryImage): string {
    return this.urlService.buildResponsiveUrl(image.url, HERO_FALLBACK_WIDTH) ?? image.url;
  }
  heroSrcSet(image: GalleryImage): string | null {
    return this.urlService.buildResponsiveSrcSet(image.url, HERO_WIDTHS);
  }
  tileSrc(image: GalleryImage): string {
    return this.urlService.buildResponsiveUrl(image.url, TILE_WIDTH) ?? image.url;
  }
  tileSrcSet(image: GalleryImage): string | null {
    return this.urlService.buildResponsiveSrcSet(image.url, [320, TILE_WIDTH, 960]);
  }
  thumbSrc(image: GalleryImage): string {
    return this.urlService.buildResponsiveUrl(image.url, THUMB_WIDTH) ?? image.url;
  }
  viewerSrc(image: GalleryImage): string {
    return this.urlService.buildResponsiveUrl(image.url, LIGHTBOX_FALLBACK_WIDTH) ?? image.url;
  }
  viewerSrcSet(image: GalleryImage): string | null {
    return this.urlService.buildResponsiveSrcSet(image.url, LIGHTBOX_WIDTHS);
  }
  readonly fallback = FALLBACK_IMAGE;

  altFor(image: GalleryImage, i: number): string {
    const total = this.count();
    const text = image.alt?.trim() || this.title().trim();
    return text
      ? this.translate.instant('GALLERY.ALT', { title: text, n: i + 1, total })
      : this.translate.instant('GALLERY.ALT_N', { n: i + 1, total });
  }

  // ── Position ────────────────────────────────────────────────────────
  goTo(i: number): void {
    const last = this.count() - 1;
    if (last < 0) return;
    this.index.set(Math.min(Math.max(i, 0), last));
  }
  /** Logical steps: -1 is the previous photo in the list in every language. */
  step(delta: -1 | 1): void {
    this.goTo(this.index() + delta);
  }
  get hasPrevious(): boolean { return this.index() > 0; }
  get hasNext(): boolean { return this.index() < this.count() - 1; }

  /** Carousel: which slide is centred after the user scrolled (RTL scroll offsets are negative). */
  onTrackScroll(): void {
    if (this.scrollFrame) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = 0;
      const el = this.track()?.nativeElement;
      if (!el || el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1) return;
      this.goTo(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
    });
  }

  /** Puts the carousel on the current photo (after the viewer closes or the list changes). */
  private syncTrack(smooth = false): void {
    const slide = this.track()?.nativeElement.children.item(this.index()) as HTMLElement | null;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    slide?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: smooth && !reduce ? 'smooth' : 'auto' });
  }

  /** Previous/next buttons of the carousel (shown for mouse users, who cannot swipe). */
  stepCarousel(delta: -1 | 1): void {
    this.step(delta);
    this.syncTrack(true);
  }

  // ── Viewer ──────────────────────────────────────────────────────────
  openViewer(i: number): void {
    if (this.count() === 0) return;
    this.goTo(i);
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.viewerOpen.set(true);
    this.scrollLock.lock();
    setTimeout(() => this.closeButton()?.nativeElement.focus(), 0);
  }

  closeViewer(): void {
    if (!this.viewerOpen()) return;
    this.viewerOpen.set(false);
    this.scrollLock.unlock();
    this.swipeStart = undefined;
    queueMicrotask(() => this.syncTrack());
    this.returnFocus?.focus();
    this.returnFocus = undefined;
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.viewerOpen()) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.closeViewer();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.step(this.isRtl() ? 1 : -1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.step(this.isRtl() ? -1 : 1);
        break;
      case 'Home':
        event.preventDefault();
        this.goTo(0);
        break;
      case 'End':
        event.preventDefault();
        this.goTo(this.count() - 1);
        break;
      case 'Tab':
        this.trapFocus(event);
        break;
    }
  }

  onStagePointerDown(event: PointerEvent): void {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;
    this.swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in a few embedded browsers.
    }
  }

  onStagePointerUp(event: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = undefined;
    if (!start || start.id !== event.pointerId) return;
    const navigation = getGallerySwipeNavigation(event.clientX - start.x, event.clientY - start.y, this.isRtl());
    if (navigation) this.step(navigation === 'next' ? 1 : -1);
  }

  onStagePointerCancel(): void {
    this.swipeStart = undefined;
  }

  private trapFocus(event: KeyboardEvent): void {
    const dialog = document.querySelector<HTMLElement>('.pg-viewer');
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
