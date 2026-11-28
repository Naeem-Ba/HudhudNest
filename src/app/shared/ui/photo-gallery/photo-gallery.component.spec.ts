import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import ar from '../../../../../public/i18n/ar.json';
import de from '../../../../../public/i18n/de.json';
import en from '../../../../../public/i18n/en.json';
import tr from '../../../../../public/i18n/tr.json';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { GalleryImage, PhotoGalleryComponent } from './photo-gallery.component';

const cloud = (n: number): string => `https://res.cloudinary.com/demo/image/upload/v1/photo-${n}.jpg`;
const photos = (n: number): GalleryImage[] => Array.from({ length: n }, (_, i) => ({ url: cloud(i + 1) }));

@Component({
  standalone: true,
  imports: [PhotoGalleryComponent],
  template: `<button id="opener" type="button">opener</button><app-photo-gallery [images]="images" [title]="title" />`
})
class HostComponent {
  images: GalleryImage[] = [];
  title = 'Sea chalet';
}

describe('PhotoGalleryComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let translate: TranslateService;
  let lock: ScrollLockService;

  const el = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement>(sel: string): T | null => el().querySelector<T>(sel);
  const all = (sel: string): HTMLElement[] => Array.from(el().querySelectorAll<HTMLElement>(sel));
  const flush = async (): Promise<void> => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const counter = (): string => (q('.pg-viewer__counter')?.textContent ?? '').trim();
  const key = (k: string): void => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); fixture.detectChanges(); };

  async function render(images: GalleryImage[], lang = 'en', dir: 'ltr' | 'rtl' = 'ltr'): Promise<void> {
    translate.use(lang);
    document.documentElement.dir = dir;
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.images = images;
    await flush();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent, TranslateModule.forRoot()] }).compileComponents();
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('ar', ar as never);
    translate.setTranslation('de', de as never);
    translate.setTranslation('en', en as never);
    translate.setTranslation('tr', tr as never);
    lock = TestBed.inject(ScrollLockService);
  });

  afterEach(() => {
    document.documentElement.dir = 'ltr';
    document.documentElement.classList.remove('scroll-locked');
  });

  describe('what it renders', () => {
    it('renders nothing for a listing without photos', async () => {
      await render([]);
      expect(q('.pg')).toBeNull();
    });

    it('ignores empty URLs and shows each photo once', async () => {
      await render([{ url: cloud(1) }, { url: '' }, { url: cloud(1) }, { url: cloud(2) }]);
      expect(all('.pg__slide').length).toBe(2);
    });

    it('a single photo has no counter, no "view all" button and no thumbnails', async () => {
      await render(photos(1));
      expect(q('.pg__counter')).toBeNull();
      expect(q('[data-testid="gallery-view-all"]')).toBeNull();
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      expect(q('.pg-viewer__thumbs')).toBeNull();
      expect(q('[data-testid="gallery-prev"]')).toBeNull();
      expect(q('[data-testid="gallery-next"]')).toBeNull();
    });

    it('reports the number of tiles for the mosaic and caps it at five', async () => {
      for (const [n, tiles] of [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [20, '5']] as const) {
        await render(photos(n));
        expect(q('.pg')!.getAttribute('data-tiles')).withContext(`${n} photos`).toBe(tiles);
      }
    });

    it('marks the photos beyond the sixth as mosaic extras but keeps them in the carousel', async () => {
      await render(photos(8));
      expect(all('.pg__slide').length).toBe(8);
      expect(all('.pg__slide--extra').length).toBe(3);
    });

    it('only the first photo is eager and high priority; the rest are lazy', async () => {
      await render(photos(3));
      const imgs = all('.pg__img');
      expect(imgs[0].getAttribute('loading')).toBe('eager');
      expect(imgs[0].getAttribute('fetchpriority')).toBe('high');
      expect(imgs[1].getAttribute('loading')).toBe('lazy');
      expect(imgs[2].getAttribute('fetchpriority')).toBeNull();
    });

    it('asks Cloudinary for sized files and leaves other hosts untouched', async () => {
      await render([{ url: cloud(1) }, { url: 'https://cdn.example.com/x.jpg' }]);
      const [first, second] = all('.pg__img') as HTMLImageElement[];
      expect(first.getAttribute('src')).toContain('/upload/f_auto,q_auto,w_1024,c_limit/');
      expect(first.getAttribute('srcset')).toContain('w_480');
      expect(second.getAttribute('src')).toBe('https://cdn.example.com/x.jpg');
      expect(second.getAttribute('srcset')).toBeNull();
    });

    it('never crops the carousel, the first tile or the viewer photo', async () => {
      await render(photos(3));
      expect(getComputedStyle(q('.pg__img')!).objectFit).toBe('contain');
    });

    it('shows the position counter for the carousel', async () => {
      await render(photos(12));
      expect((q('.pg__counter')!.textContent ?? '').trim()).toBe('1 / 12');
    });
  });

  describe('alt text', () => {
    it('uses the photo description, then the title, with the position, in each language', async () => {
      for (const [lang, expected] of [
        ['en', 'Sea chalet - photo 2 of 3'],
        ['de', 'Sea chalet - Foto 2 von 3'],
        ['ar', 'Sea chalet - صورة 2 من 3'],
        ['tr', 'Sea chalet - fotoğraf 2 / 3']
      ] as const) {
        await render(photos(3), lang);
        expect(all('.pg__img')[1].getAttribute('alt')).withContext(lang).toBe(expected);
      }
    });

    it('prefers the owner description of a photo', async () => {
      await render([{ url: cloud(1), alt: 'Living room' }, { url: cloud(2) }]);
      expect(all('.pg__img')[0].getAttribute('alt')).toBe('Living room - photo 1 of 2');
    });

    it('still describes the position when the listing has no title', async () => {
      fixture = TestBed.createComponent(HostComponent);
      fixture.componentInstance.title = '';
      fixture.componentInstance.images = photos(2);
      translate.use('en');
      await flush();
      expect(all('.pg__img')[1].getAttribute('alt')).toBe('Photo 2 of 2');
    });

    it('labels the buttons that open a photo, in German', async () => {
      await render(photos(2), 'de');
      expect(all('.pg__slide')[1].getAttribute('aria-label')).toBe('Foto 2 von 2 öffnen');
      expect(q('[data-testid="gallery-view-all"]')!.textContent).toContain('Alle 2 Fotos ansehen');
    });
  });

  describe('viewer', () => {
    it('opens on the tapped photo, locks the page scroll and focuses the close button', async () => {
      await render(photos(5));
      spyOn(lock, 'lock').and.callThrough();
      all('.pg__slide')[2].click();
      await flush();
      await new Promise(r => setTimeout(r));
      expect(q('[data-testid="gallery-viewer"]')).not.toBeNull();
      expect(q('[role="dialog"]')!.getAttribute('aria-modal')).toBe('true');
      expect(counter()).toBe('3 / 5');
      expect(lock.lock).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(q('[data-testid="gallery-close"]'));
    });

    it('the "view all" button opens the viewer on the first photo', async () => {
      await render(photos(5));
      q<HTMLButtonElement>('[data-testid="gallery-view-all"]')!.click();
      await flush();
      expect(counter()).toBe('1 / 5');
    });

    it('steps with the buttons and hides the one that has nowhere to go', async () => {
      await render(photos(3));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      expect(q('[data-testid="gallery-prev"]')).toBeNull();
      q<HTMLButtonElement>('[data-testid="gallery-next"]')!.click();
      await flush();
      expect(counter()).toBe('2 / 3');
      q<HTMLButtonElement>('[data-testid="gallery-next"]')!.click();
      await flush();
      expect(counter()).toBe('3 / 3');
      expect(q('[data-testid="gallery-next"]')).toBeNull();
      q<HTMLButtonElement>('[data-testid="gallery-prev"]')!.click();
      await flush();
      expect(counter()).toBe('2 / 3');
    });

    it('jumps to a photo with its thumbnail', async () => {
      await render(photos(6));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      all('.pg-viewer__thumb')[4].click();
      await flush();
      expect(counter()).toBe('5 / 6');
      expect(all('.pg-viewer__thumb')[4].getAttribute('aria-current')).toBe('true');
      expect(q('.pg-viewer__img')!.getAttribute('src')).toContain('photo-5.jpg');
    });

    it('left/right arrows follow the reading direction in LTR', async () => {
      await render(photos(4), 'en', 'ltr');
      all('.pg__slide')[1].click();
      await flush();
      key('ArrowRight');
      expect(counter()).toBe('3 / 4');
      key('ArrowLeft');
      key('ArrowLeft');
      expect(counter()).toBe('1 / 4');
    });

    it('left/right arrows are reversed in RTL', async () => {
      await render(photos(4), 'ar', 'rtl');
      all('.pg__slide')[1].click();
      await flush();
      key('ArrowLeft');
      expect(counter()).toBe('3 / 4');
      key('ArrowRight');
      key('ArrowRight');
      expect(counter()).toBe('1 / 4');
    });

    it('Home and End jump to the ends, and the position never leaves the list', async () => {
      await render(photos(4));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      key('End');
      expect(counter()).toBe('4 / 4');
      key('ArrowRight');
      expect(counter()).toBe('4 / 4');
      key('Home');
      key('ArrowLeft');
      expect(counter()).toBe('1 / 4');
    });

    it('ignores the keyboard while the viewer is closed', async () => {
      await render(photos(3));
      key('ArrowRight');
      key('Escape');
      expect(q('[data-testid="gallery-viewer"]')).toBeNull();
    });

    it('Escape closes it, unlocks the scroll and returns focus to the opener', async () => {
      await render(photos(3));
      const opener = q<HTMLButtonElement>('.pg__slide')!;
      opener.focus();
      spyOn(lock, 'unlock').and.callThrough();
      opener.click();
      await flush();
      key('Escape');
      await flush();
      expect(q('[data-testid="gallery-viewer"]')).toBeNull();
      expect(lock.unlock).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(opener);
    });

    it('the close button closes it', async () => {
      await render(photos(2));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      q<HTMLButtonElement>('[data-testid="gallery-close"]')!.click();
      await flush();
      expect(q('[data-testid="gallery-viewer"]')).toBeNull();
    });

    it('keeps Tab inside the dialog', async () => {
      await render(photos(3));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      const focusable = all('.pg-viewer button');
      focusable.at(-1)!.focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(focusable[0]);
    });

    it('releases the scroll lock when the page is left with the viewer open', async () => {
      await render(photos(3));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      expect(document.documentElement.classList.contains('scroll-locked')).toBeTrue();
      fixture.destroy();
      expect(document.documentElement.classList.contains('scroll-locked')).toBeFalse();
    });

    it('a failed full-size image falls back instead of leaving a hole', async () => {
      await render(photos(2));
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      const img = q<HTMLImageElement>('.pg-viewer__img')!;
      img.dispatchEvent(new Event('error'));
      expect(img.src.endsWith('/images/no-image.svg')).toBeTrue();
    });
  });

  describe('swipe in the viewer', () => {
    const swipe = (dx: number, dy = 0): void => {
      const stage = q('.pg-viewer__stage')!;
      const base = { pointerId: 1, isPrimary: true, pointerType: 'touch', bubbles: true } as PointerEventInit;
      stage.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: 200, clientY: 100 }));
      stage.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: 200 + dx, clientY: 100 + dy }));
      fixture.detectChanges();
    };

    it('a left swipe shows the next photo in LTR and the previous one in RTL', async () => {
      await render(photos(4), 'en', 'ltr');
      all('.pg__slide')[1].click();
      await flush();
      swipe(-90);
      expect(counter()).toBe('3 / 4');
      swipe(90);
      expect(counter()).toBe('2 / 4');
    });

    it('is mirrored in RTL', async () => {
      await render(photos(4), 'ar', 'rtl');
      all('.pg__slide')[1].click();
      await flush();
      swipe(90);
      expect(counter()).toBe('3 / 4');
      swipe(-90);
      expect(counter()).toBe('2 / 4');
    });

    it('ignores a short or mostly vertical drag', async () => {
      await render(photos(4));
      all('.pg__slide')[1].click();
      await flush();
      swipe(20);
      swipe(70, 120);
      expect(counter()).toBe('2 / 4');
    });
  });

  describe('carousel scrolling', () => {
    it('follows the slide the user scrolled to (offset geometry stubbed: the test page has no layout)', async () => {
      await render(photos(5));
      const track = q('.pg__track')!;
      const slideWidth = 300;
      Object.defineProperty(track, 'clientWidth', { value: slideWidth, configurable: true });
      Object.defineProperty(track, 'scrollWidth', { value: slideWidth * 5, configurable: true });
      Object.defineProperty(track, 'scrollLeft', { value: slideWidth * 3, configurable: true });
      track.dispatchEvent(new Event('scroll'));
      await new Promise(r => requestAnimationFrame(() => r(null)));
      fixture.detectChanges();
      expect((q('.pg__counter')!.textContent ?? '').trim()).toBe('4 / 5');
    });

    it('reads RTL (negative) scroll offsets', async () => {
      await render(photos(5), 'ar', 'rtl');
      const track = q('.pg__track')!;
      Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
      Object.defineProperty(track, 'scrollWidth', { value: 1500, configurable: true });
      Object.defineProperty(track, 'scrollLeft', { value: -600, configurable: true });
      track.dispatchEvent(new Event('scroll'));
      await new Promise(r => requestAnimationFrame(() => r(null)));
      fixture.detectChanges();
      expect((q('.pg__counter')!.textContent ?? '').trim()).toBe('3 / 5');
    });
  });

  describe('layout in a real browser (the gallery follows its own width, not the viewport)', () => {
    const rect = (e: Element): DOMRect => e.getBoundingClientRect();
    const hostAt = async (width: number, n: number, lang = 'en', dir: 'ltr' | 'rtl' = 'ltr'): Promise<void> => {
      await render(photos(n), lang, dir);
      const host = q('app-photo-gallery')!;
      host.style.cssText = `display:block;width:${width}px`;
      fixture.detectChanges();
    };

    for (const width of [320, 360, 375, 390, 430, 639]) {
      it(`${width}px wide: a swipe carousel, one photo per screen, no overflow`, async () => {
        await hostAt(width, 8);
        const pg = q('.pg')!;
        const track = q('.pg__track')!;
        expect(getComputedStyle(track).display).toBe('flex');
        expect(getComputedStyle(track).overflowX).toBe('auto');
        expect(getComputedStyle(track).scrollSnapType).toContain('x mandatory');
        expect(rect(pg).width).toBeCloseTo(width, 0);
        expect(Math.abs(rect(all('.pg__slide')[0]).width - width)).toBeLessThan(1.5);
        expect(track.scrollWidth).toBeGreaterThan(track.clientWidth);
        expect(pg.scrollWidth).toBeLessThanOrEqual(pg.clientWidth + 1);
        expect(getComputedStyle(q('.pg__counter')!).display).not.toBe('none');
        expect(getComputedStyle(q('[data-testid="gallery-view-all"]')!).display).toBe('none');
        // the counter stays inside the frame
        const c = rect(q('.pg__counter')!);
        expect(c.right).toBeLessThanOrEqual(rect(pg).right + .5);
        expect(c.left).toBeGreaterThanOrEqual(rect(pg).left - .5);
      });
    }

    for (const width of [640, 768, 1024, 1366, 1920]) {
      it(`${width}px wide: a mosaic with the first photo large and a "view all" button`, async () => {
        await hostAt(width, 8);
        const pg = q('.pg')!;
        const track = q('.pg__track')!;
        expect(getComputedStyle(track).display).toBe('grid');
        const visible = all('.pg__slide').filter(sl => getComputedStyle(sl).display !== 'none');
        expect(visible.length).toBe(5);
        const first = rect(visible[0]);
        const second = rect(visible[1]);
        expect(first.width).toBeGreaterThan(second.width * 1.5);
        expect(first.height).toBeGreaterThan(second.height * 1.5);
        expect(getComputedStyle(q('.pg__counter')!).display).toBe('none');
        const all_ = rect(q('[data-testid="gallery-view-all"]')!);
        expect(all_.width).toBeGreaterThan(0);
        expect(all_.right).toBeLessThanOrEqual(rect(pg).right + .5);
        expect(all_.height).toBeGreaterThanOrEqual(44);
        // tiles do not overlap each other
        for (let i = 0; i < visible.length; i++) {
          for (let j = i + 1; j < visible.length; j++) {
            const a = rect(visible[i]); const b = rect(visible[j]);
            const overlap = a.left < b.right - .5 && a.right > b.left + .5 && a.top < b.bottom - .5 && a.bottom > b.top + .5;
            expect(overlap).withContext(`tile ${i} vs ${j}`).toBeFalse();
          }
        }
        expect(pg.scrollWidth).toBeLessThanOrEqual(pg.clientWidth + 1);
      });
    }

    it('the mosaic fills its frame with two photos, three photos and four photos', async () => {
      for (const n of [2, 3, 4]) {
        await hostAt(900, n);
        const frame = rect(q('.pg__track')!);
        const slides = all('.pg__slide').map(rect);
        const left = Math.min(...slides.map(r => r.left));
        const right = Math.max(...slides.map(r => r.right));
        const top = Math.min(...slides.map(r => r.top));
        const bottom = Math.max(...slides.map(r => r.bottom));
        expect(Math.abs(left - frame.left)).withContext(`${n} left`).toBeLessThan(1);
        expect(Math.abs(right - frame.right)).withContext(`${n} right`).toBeLessThan(1);
        expect(Math.abs(top - frame.top)).withContext(`${n} top`).toBeLessThan(1);
        expect(Math.abs(bottom - frame.bottom)).withContext(`${n} bottom`).toBeLessThan(1);
      }
    });

    it('a mosaic is mirrored in RTL: the large photo is on the right', async () => {
      await hostAt(900, 5, 'ar', 'rtl');
      const [first, second] = all('.pg__slide').map(rect);
      expect(first.left).toBeGreaterThan(second.left);
    });

    it('the carousel keeps its height when the photo is missing (no layout shift)', async () => {
      await hostAt(390, 3);
      const before = rect(q('.pg__track')!).height;
      all('.pg__img').forEach(i => i.dispatchEvent(new Event('error')));
      fixture.detectChanges();
      expect(rect(q('.pg__track')!).height).toBeCloseTo(before, 0);
      expect(before).toBeGreaterThan(200);
    });

    it('the viewer covers the whole viewport and keeps its controls on screen', async () => {
      await hostAt(390, 6);
      q<HTMLButtonElement>('.pg__slide')!.click();
      await flush();
      const viewer = q('.pg-viewer')!;
      const v = rect(viewer);
      expect(v.left).toBe(0);
      expect(v.top).toBe(0);
      expect(v.width).toBe(document.documentElement.clientWidth);
      expect(v.height).toBe(window.innerHeight);
      for (const sel of ['[data-testid="gallery-close"]', '[data-testid="gallery-next"]', '.pg-viewer__thumb']) {
        const r = rect(q(sel)!);
        expect(r.left).withContext(sel).toBeGreaterThanOrEqual(-.5);
        expect(r.right).withContext(sel).toBeLessThanOrEqual(v.right + .5);
        expect(r.bottom).withContext(sel).toBeLessThanOrEqual(v.bottom + .5);
        expect(r.top).withContext(sel).toBeGreaterThanOrEqual(-.5);
      }
      for (const sel of ['[data-testid="gallery-close"]', '[data-testid="gallery-next"]']) {
        const r = rect(q(sel)!);
        expect(r.width).withContext(sel).toBeGreaterThanOrEqual(44);
        expect(r.height).withContext(sel).toBeGreaterThanOrEqual(44);
      }
      expect(viewer.scrollWidth).toBeLessThanOrEqual(viewer.clientWidth + 1);
    });

    it('in RTL the previous button is on the right and its arrow is mirrored', async () => {
      await hostAt(390, 6, 'ar', 'rtl');
      all('.pg__slide')[2].click();
      await flush();
      const prev = rect(q('[data-testid="gallery-prev"]')!);
      const next = rect(q('[data-testid="gallery-next"]')!);
      expect(prev.left).toBeGreaterThan(next.left);
      expect(getComputedStyle(q('[data-testid="gallery-prev"] svg')!).transform).not.toBe('none');
    });
  });
});
