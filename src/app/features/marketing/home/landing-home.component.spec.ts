import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { PageMetaService } from '../../../core/services/page-meta.service';
import { MARKETING_CONFIG } from '../marketing.config';
import { WaitlistService } from '../waitlist/waitlist.service';
import { LandingHomeComponent } from './landing-home.component';

function create(listingsLive: boolean) {
  TestBed.configureTestingModule({
    imports: [LandingHomeComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: MARKETING_CONFIG, useValue: { listingsLive, appUrl: 'https://app.example' } },
      { provide: PageMetaService, useValue: { applyTranslated: () => undefined } }
    ]
  });
  const fixture = TestBed.createComponent(LandingHomeComponent);
  fixture.detectChanges();
  return fixture;
}

describe('LandingHomeComponent', () => {
  it('has exactly one h1 and no search form, mock card or empty-state link while listingsLive is false', () => {
    const el: HTMLElement = create(false).nativeElement;
    expect(el.querySelectorAll('h1').length).toBe(1);
    expect(el.querySelector('input, form')).toBeNull();
    expect(el.querySelector('a[href*="/properties"]')).toBeNull();
  });

  it('listingsLive=false: primary gold button is the platform link, secondary opens the waitlist', () => {
    const fixture = create(false);
    const el: HTMLElement = fixture.nativeElement;
    const primary = el.querySelector('.hero__ctas .btn--gold') as HTMLAnchorElement;
    expect(primary.tagName).toBe('A');
    expect(primary.getAttribute('href')).toBe('https://app.example/property-form');
    const waitlist = TestBed.inject(WaitlistService);
    (el.querySelector('.hero__ctas .btn--outline') as HTMLButtonElement).click();
    expect(waitlist.dialog()).toEqual({ open: true, interest: null });
  });

  it('listingsLive=true: primary links into the search', () => {
    const el: HTMLElement = create(true).nativeElement;
    const primary = el.querySelector('.hero__ctas .btn--gold') as HTMLAnchorElement;
    expect(primary.getAttribute('href')).toBe('/properties');
  });

  it('renders four start cards; the three searching ones open the waitlist with the interest preselected', () => {
    const fixture = create(false);
    const el: HTMLElement = fixture.nativeElement;
    const cards = el.querySelectorAll('.start__grid .card');
    expect(cards.length).toBe(4);
    const waitlist = TestBed.inject(WaitlistService);
    (cards[1] as HTMLButtonElement).click();
    expect(waitlist.dialog()).toEqual({ open: true, interest: 'mieten' });
    expect(cards[3].tagName).toBe('A');
    expect(cards[3].getAttribute('href')).toBe('https://app.example/property-form');
  });

  it('shows three reasons in the "why" section', () => {
    const el: HTMLElement = create(false).nativeElement;
    expect(el.querySelectorAll('.why__list li').length).toBe(3);
  });
});
