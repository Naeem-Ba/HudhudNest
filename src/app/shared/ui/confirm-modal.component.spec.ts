import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { ConfirmModalComponent } from './confirm-modal.component';
import { OverlayBackHandlerService } from '../../core/services/overlay-back-handler.service';
import { ScrollLockService } from '../../core/services/scroll-lock.service';

@Component({
  standalone: true,
  imports: [ConfirmModalComponent],
  template: `<app-confirm-modal
    [open]="open"
    [loading]="loading"
    [closeOnBackdrop]="closeOnBackdrop"
    title="t"
    (cancelled)="cancelled = cancelled + 1"
  ></app-confirm-modal>`
})
class HostComponent {
  open = false;
  loading = false;
  closeOnBackdrop = true;
  cancelled = 0;
}

describe('ConfirmModalComponent overlay behaviour', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let scrollLock: jasmine.SpyObj<ScrollLockService>;
  let back: OverlayBackHandlerService;

  beforeEach(() => {
    scrollLock = jasmine.createSpyObj('ScrollLockService', ['lock', 'unlock']);

    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()],
      providers: [{ provide: ScrollLockService, useValue: scrollLock }]
    });

    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    back = TestBed.inject(OverlayBackHandlerService);
  });

  function setOpen(value: boolean): void {
    host.open = value;
    fixture.detectChanges();
  }

  it('locks page scroll while open and releases it exactly once on close', () => {
    setOpen(true);
    expect(scrollLock.lock).toHaveBeenCalledTimes(1);

    setOpen(false);
    expect(scrollLock.unlock).toHaveBeenCalledTimes(1);
  });

  it('releases the lock when destroyed while still open', () => {
    setOpen(true);
    fixture.destroy();

    expect(scrollLock.unlock).toHaveBeenCalledTimes(1);
  });

  it('lets the hardware Back button dismiss it instead of leaving the screen', () => {
    setOpen(true);

    expect(back.closeTopOverlay()).toBeTrue();
    expect(host.cancelled).toBe(1);
  });

  it('consumes Back without dismissing while a request is in flight or when it cannot be skipped', () => {
    host.loading = true;
    setOpen(true);

    expect(back.closeTopOverlay()).toBeTrue();
    expect(host.cancelled).toBe(0);
  });

  it('stops handling Back once closed', () => {
    setOpen(true);
    setOpen(false);

    expect(back.closeTopOverlay()).toBeFalse();
  });

  it('dismisses on Escape only while open', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.cancelled).toBe(0);

    setOpen(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.cancelled).toBe(1);
  });
});
