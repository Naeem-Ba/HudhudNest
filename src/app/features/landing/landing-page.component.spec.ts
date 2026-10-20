import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Subject, of } from 'rxjs';

import { LandingPageComponent } from './landing-page.component';
import { ActiveOfferState, OffersApiService } from '../../core/api/offers-api.service';
import { MarketingEventsApiService } from '../../core/api/marketing-events-api.service';
import { MetaService } from '../../core/services/meta.service';
import { LeadService } from '../../core/services/lead.service';
import { Offer } from '../../core/models/offer.model';

const LIVE: Offer = {
  id: 'o-1', name: 'أول 100 مكتب عقاري', description: 'خصم للمنضمين مبكرًا', discountType: 'Percentage',
  discountValue: 25, targetPlanTier: null, endsAtUtc: '2026-12-31T00:00:00Z', maxRedemptions: 100,
  redeemedCount: 40, terms: 'للمكاتب الجديدة فقط',
};

describe('LandingPageComponent — marketing offer section', () => {
  let offersApi: jasmine.SpyObj<OffersApiService>;
  let events: jasmine.SpyObj<MarketingEventsApiService>;
  let meta: jasmine.SpyObj<MetaService>;

  function create(state$: ReturnType<OffersApiService['getActiveOfferState']>, campaign: string | null = null) {
    offersApi.getActiveOfferState.and.returnValue(state$);
    TestBed.configureTestingModule({
      imports: [LandingPageComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: OffersApiService, useValue: offersApi },
        { provide: MarketingEventsApiService, useValue: events },
        { provide: MetaService, useValue: meta },
        { provide: LeadService, useValue: jasmine.createSpyObj('LeadService', ['submitLead']) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (k: string) => (k === 'utm_campaign' ? campaign : null) } } } },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      OFFER_COMMON: { DISCOUNT_PERCENT: '{{value}}% off' },
      LANDING: { OFFER: { ENDS_ON: 'Offer ends on {{date}}', EMPTY_TITLE: 'No offers are published right now', ERROR_TITLE: 'Offers could not be loaded', RETRY: 'Try again', CTA: 'Register', EYEBROW: 'x', LOADING_ARIA: 'Loading offers', PROGRESS_LABEL: '{{count}} of {{max}}', PROGRESS_ARIA: '{{count}} of {{max}}' } },
    });
    translate.use('en');
    const fixture = TestBed.createComponent(LandingPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    offersApi = jasmine.createSpyObj('OffersApiService', ['getActiveOfferState']);
    events = jasmine.createSpyObj('MarketingEventsApiService', ['track']);
    meta = jasmine.createSpyObj('MetaService', ['setLandingMeta']);
  });

  it('shows a loading skeleton while the offer is being fetched', () => {
    const fixture = create(new Subject<ActiveOfferState>());
    expect(fixture.componentInstance.offerState()).toBe('loading');
    expect(fixture.nativeElement.querySelector('.offer-card--skeleton')).not.toBeNull();
  });

  it('renders the live offer: name, translated discount, end date, progress and CTA; tracks the view', () => {
    const fixture = create(of<ActiveOfferState>({ status: 'ready', offer: LIVE }), 'marketing_offer');
    const text: string = fixture.nativeElement.textContent;

    expect(fixture.componentInstance.offerState()).toBe('ready');
    expect(text).toContain('أول 100 مكتب عقاري');
    expect(text).toContain('25% off');
    expect(text).toMatch(/Offer ends on .*2026/);
    expect(text).toContain('40 of 100');
    expect(fixture.nativeElement.querySelector('.offer-card__cta')).not.toBeNull();
    expect(meta.setLandingMeta).toHaveBeenCalledWith({ offerName: LIVE.name, offerDescription: LIVE.description });
    expect(events.track).toHaveBeenCalledOnceWith('PageView', { offerId: 'o-1', campaign: 'marketing_offer' });
  });

  it('the offer CTA scrolls to the real form, preselects "agency" and records a CtaClick', () => {
    const fixture = create(of<ActiveOfferState>({ status: 'ready', offer: LIVE }));
    const page = fixture.componentInstance;
    spyOn(page, 'scrollToForm');

    fixture.nativeElement.querySelector('.offer-card__cta').click();

    expect(page.form.getRawValue().userType).toBe('agency');
    expect(page.scrollToForm).toHaveBeenCalled();
    expect(events.track).toHaveBeenCalledWith('CtaClick', { offerId: 'o-1', campaign: null });
  });

  it('shows a clear empty state — not an error — when no offer is published', () => {
    const fixture = create(of<ActiveOfferState>({ status: 'empty' }));

    expect(fixture.nativeElement.textContent).toContain('No offers are published right now');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.componentInstance.activeOffer()).toBeNull();
  });

  it('a load failure stays inside the offer section, offers a retry, and the rest of the page still renders', () => {
    const fixture = create(of<ActiveOfferState>({ status: 'error' }));

    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Offers could not be loaded');
    expect(fixture.nativeElement.querySelector('#waitlist-form')).not.toBeNull();

    offersApi.getActiveOfferState.and.returnValue(of<ActiveOfferState>({ status: 'ready', offer: LIVE }));
    fixture.componentInstance.loadOffer();
    fixture.detectChanges();

    expect(fixture.componentInstance.offerState()).toBe('ready');
    // retrying is not a second page view
    expect(events.track.calls.allArgs().filter(a => a[0] === 'PageView').length).toBe(1);
  });
});
