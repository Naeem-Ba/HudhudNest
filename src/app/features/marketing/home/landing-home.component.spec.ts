import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { MarketingEventsApiService } from '../../../core/api/marketing-events-api.service';
import { ActiveOfferState, OffersApiService } from '../../../core/api/offers-api.service';
import { PageMetaService } from '../../../core/services/page-meta.service';
import { MARKETING_CONFIG } from '../marketing.config';
import { WaitlistService } from '../waitlist/waitlist.service';
import { LandingHomeComponent } from './landing-home.component';

const OFFER = { id: 'o1', name: 'First 100 offices', description: 'Join early', discountType: 'Percentage', discountValue: 20, endsAtUtc: null, maxRedemptions: 100, redeemedCount: 40, terms: 'Terms apply' } as const;

let events: jasmine.SpyObj<MarketingEventsApiService>;

function create(listingsLive: boolean, offerState: ActiveOfferState = { status: 'empty' }) {
  events = jasmine.createSpyObj('MarketingEventsApiService', ['track']);
  TestBed.configureTestingModule({
    imports: [LandingHomeComponent, TranslateModule.forRoot()],
    providers: [
      provideRouter([]),
      { provide: MARKETING_CONFIG, useValue: { listingsLive, appUrl: 'https://app.example' } },
      { provide: PageMetaService, useValue: { applyTranslated: () => undefined } },
      { provide: OffersApiService, useValue: { getActiveOfferState: () => of(offerState) } },
      { provide: MarketingEventsApiService, useValue: events }
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

  describe('live marketing offer', () => {
    it('shows no offer card (and no empty or error state) when nothing is active or the request failed', () => {
      for (const state of [{ status: 'empty' }, { status: 'error' }] as ActiveOfferState[]) {
        TestBed.resetTestingModule();
        const el: HTMLElement = create(false, state).nativeElement;
        expect(el.querySelector('.offer')).toBeNull();
      }
    });

    it('renders the active offer with its real progress and a CTA to /fuer-anbieter that is tracked', () => {
      const fixture = create(false, { status: 'ready', offer: OFFER as never });
      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.offer h2')?.textContent).toContain('First 100 offices');
      expect((el.querySelector('.offer__fill') as HTMLElement).style.width).toBe('40%');
      const cta = el.querySelector('.offer a.btn') as HTMLAnchorElement;
      expect(cta.getAttribute('href')).toBe('/fuer-anbieter');
      cta.click();
      expect(events.track).toHaveBeenCalledWith('CtaClick', { offerId: 'o1', campaign: null });
    });

    it('hides the progress bar for an offer without a maximum (no invented counter)', () => {
      const el: HTMLElement = create(false, { status: 'ready', offer: { ...OFFER, maxRedemptions: null } as never }).nativeElement;
      expect(el.querySelector('.offer__progress')).toBeNull();
    });

    it('counts one page view per visit, attributed to the live offer', () => {
      create(false, { status: 'ready', offer: OFFER as never });
      expect(events.track).toHaveBeenCalledOnceWith('PageView', { offerId: 'o1', campaign: null });
    });
  });
});
