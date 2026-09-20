import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { PhotoGuideSheetComponent } from './photo-guide-sheet.component';
import {
  PHOTO_GUIDE_IMAGES,
  PHOTO_GUIDE_SHOTS,
  PhotoGuideKind,
  photoGuideKindForListingType
} from './photo-guide.data';
import { ScrollLockService } from '../../../core/services/scroll-lock.service';

@Component({
  standalone: true,
  imports: [PhotoGuideSheetComponent],
  template: `<app-photo-guide-sheet [open]="open()" [kind]="kind()" (closed)="closes = closes + 1" (start)="starts = starts + 1" />`
})
class HostComponent {
  open = signal(false);
  kind = signal<PhotoGuideKind>('rent');
  closes = 0;
  starts = 0;
}

describe('PhotoGuideSheetComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let scrollLock: jasmine.SpyObj<ScrollLockService>;

  const el = () => fixture.nativeElement as HTMLElement;
  const dialog = () => el().querySelector('[role="dialog"]') as HTMLElement | null;
  const click = (selector: string) => (el().querySelector(selector) as HTMLElement).click();

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    scrollLock = jasmine.createSpyObj('ScrollLockService', ['lock', 'unlock']);
    await TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: [{ provide: ScrollLockService, useValue: scrollLock }]
    }).compileComponents();

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('renders nothing (and does not lock scrolling) while closed', async () => {
    await render();
    expect(dialog()).toBeNull();
    expect(scrollLock.lock).not.toHaveBeenCalled();
  });

  it('opens as a modal dialog, locks scrolling, and unlocks when closed', async () => {
    host.open.set(true);
    await render();
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(scrollLock.lock).toHaveBeenCalledTimes(1);

    host.open.set(false);
    await render();
    expect(dialog()).toBeNull();
    expect(scrollLock.unlock).toHaveBeenCalledTimes(1);
  });

  it('releases the scroll lock if the host is destroyed while the guide is open', async () => {
    host.open.set(true);
    await render();
    fixture.destroy();
    expect(scrollLock.unlock).toHaveBeenCalledTimes(1);
  });

  it('emits closed on Escape, the close button and a backdrop click', async () => {
    host.open.set(true);
    await render();

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    click('.pg__close');
    (el().querySelector('.pg__backdrop') as HTMLElement).click();
    expect(host.closes).toBe(3);

    // a click inside the sheet must not close it
    dialog()!.click();
    expect(host.closes).toBe(3);
  });

  it('walks through every shot for the kind, then shows tips and the start button', async () => {
    host.open.set(true);
    host.kind.set('sale');
    await render();

    const total = PHOTO_GUIDE_SHOTS.sale.length;
    expect(el().querySelectorAll('.pg__dot').length).toBe(total + 1);

    for (let i = 0; i < total; i++) {
      expect(el().querySelector('.pg__frame img')?.getAttribute('src')).toBe(PHOTO_GUIDE_IMAGES[PHOTO_GUIDE_SHOTS.sale[i]]);
      click('.pg__btn--primary');
      await render();
    }

    expect(el().querySelector('.pg__frame')).toBeNull();
    expect(el().querySelectorAll('.pg__tips li').length).toBeGreaterThan(5);
    click('.pg__btn--primary');
    expect(host.starts).toBe(1);
  });

  it('supports Back, direct navigation through the numbered dots, and reopens at the first shot', async () => {
    host.open.set(true);
    await render();

    (el().querySelectorAll('.pg__dot')[2] as HTMLElement).click();
    await render();
    expect(el().querySelector('.pg__dot--active')?.textContent?.trim()).toBe('3');

    click('.pg__btn--ghost');
    await render();
    expect(el().querySelector('.pg__dot--active')?.textContent?.trim()).toBe('2');

    host.open.set(false);
    await render();
    host.open.set(true);
    await render();
    expect(el().querySelector('.pg__dot--active')?.textContent?.trim()).toBe('1');
  });

  it('moves with the arrow keys following the reading direction', async () => {
    host.open.set(true);
    await render();

    document.documentElement.dir = 'ltr';
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await render();
    expect(el().querySelector('.pg__dot--active')?.textContent?.trim()).toBe('2');

    document.documentElement.dir = 'rtl';
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await render();
    expect(el().querySelector('.pg__dot--active')?.textContent?.trim()).toBe('1');
    document.documentElement.dir = 'ltr';
  });

  it('adapts the shots to the listing kind and never repeats a shot', () => {
    (Object.keys(PHOTO_GUIDE_SHOTS) as PhotoGuideKind[]).forEach(kind => {
      const shots = PHOTO_GUIDE_SHOTS[kind];
      expect(new Set(shots).size).toBe(shots.length);
      shots.forEach(s => expect(PHOTO_GUIDE_IMAGES[s]).toMatch(/^\/images\/photo-guide\/\w+\.svg$/));
    });
    expect(PHOTO_GUIDE_SHOTS.sale[0]).toBe('FACADE');
    expect(PHOTO_GUIDE_SHOTS.shortStay[0]).toBe('BEDROOM');
    expect(PHOTO_GUIDE_SHOTS.rent).not.toContain('COURTYARD');
  });

  it('maps the form listing type (1 rent, 2 sale) to a guide kind', () => {
    expect(photoGuideKindForListingType(2)).toBe('sale');
    expect(photoGuideKindForListingType(1)).toBe('rent');
    expect(photoGuideKindForListingType(null)).toBe('rent');
  });
});
