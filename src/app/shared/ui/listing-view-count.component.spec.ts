import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ListingViewCountComponent } from './listing-view-count.component';

@Component({
  standalone: true,
  imports: [ListingViewCountComponent],
  template: `<app-listing-view-count [count]="count" [compact]="compact" />`
})
class HostComponent {
  count: number | null | undefined = 1248;
  compact = false;
}

describe('ListingViewCountComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = () => fixture.nativeElement as HTMLElement;
  const chip = () => el().querySelector('[data-testid="view-count"]') as HTMLElement | null;

  beforeEach(() => {
    document.documentElement.lang = 'en';
    TestBed.configureTestingModule({
      imports: [HostComponent, TranslateModule.forRoot()]
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', { VIEW_COUNT: { LABEL: 'Views', ARIA: 'Views: {{count}}' } });
    translate.use('en');
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  afterEach(() => { document.documentElement.lang = 'ar'; });

  it('shows the full number with an eye icon and an accessible label on the detail page', () => {
    fixture.detectChanges();
    expect(chip()).not.toBeNull();
    expect(chip()!.querySelector('svg')).not.toBeNull();
    expect(chip()!.querySelector('.view-count__num')!.textContent!.trim()).toBe('1,248');
    expect(chip()!.querySelector('.view-count__sr')!.textContent!.trim()).toBe('Views: 1,248');
    expect(chip()!.getAttribute('title')).toBe('Views');
  });

  it('shows zero as 0 (a listing nobody opened yet), not nothing', () => {
    host.count = 0;
    fixture.detectChanges();
    expect(chip()!.querySelector('.view-count__num')!.textContent!.trim()).toBe('0');
  });

  it('draws nothing when the server sent no count (older API), rather than a false 0', () => {
    host.count = undefined;
    fixture.detectChanges();
    expect(chip()).toBeNull();
    host.count = null;
    fixture.detectChanges();
    expect(chip()).toBeNull();
  });

  it('uses the short form on cards but keeps the full number for assistive technology', () => {
    host.compact = true;
    fixture.detectChanges();
    expect(chip()!.querySelector('.view-count__num')!.textContent!.trim()).toBe('1.2K');
    expect(chip()!.querySelector('.view-count__sr')!.textContent!.trim()).toBe('Views: 1,248');
    expect(chip()!.classList.contains('view-count--compact')).toBeTrue();
  });

  it('formats in the language on screen', () => {
    document.documentElement.lang = 'de';
    fixture.detectChanges();
    expect(chip()!.querySelector('.view-count__num')!.textContent!.trim()).toBe('1.248');
  });

  it('is information, not an action: no button, link or tab stop', () => {
    fixture.detectChanges();
    expect(el().querySelector('button, a, [tabindex], [role="button"]')).toBeNull();
  });

  it('needs no HTTP or tracking service: merely rendering a card cannot record a view', () => {
    // Created with only the translate module above - no HttpClient, no ListingViewsApiService provided.
    fixture.detectChanges();
    expect(chip()).not.toBeNull();
  });
});
