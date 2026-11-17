import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { HudhudAiApiService, aiErrorCode } from '../../core/api/hudhud-ai-api.service';
import { AiChatResponse, AiStatus } from '../../core/models/hudhud-ai.model';
import { LanguageService } from '../../core/services/language.service';
import { aiFilterChips } from './hudhud-ai-chips';
import { launcherHiddenOn } from './hudhud-ai-launcher.component';
import { HudhudAiPanelComponent } from './hudhud-ai-panel.component';

const STATUS: AiStatus = { enabled: true, guestsEnabled: true, modelAvailable: false, maxMessageCharacters: 1000 };

function answer(over: Partial<AiChatResponse> = {}): AiChatResponse {
  return {
    conversationId: null, messageId: null, kind: 'results', language: 'ar', text: 'وجدت 1 عقار',
    understoodFilter: { listingType: 'ForRent', maxPrice: 500, currencyCode: 'USD' },
    results: {
      totalCount: 1, searchUrl: '/properties?listingType=ForRent', searchUrlComplete: true,
      cards: [{
        id: 'p1', title: '<b>شقة</b>', listingType: 'ForRent', price: 400, priceKind: 'ColdRent', currencyCode: 'USD',
        rooms: 3, area: 120, areaUnit: 'SquareMeter', floor: 2, placeLabel: 'المزة', mainImageUrl: null, isFeatured: false, agency: null
      }]
    },
    comparison: null, suggestions: ['الأرخص أولًا'], usage: { remainingToday: 4, remainingThisMonth: null, resetsAtUtc: '2026-11-18T00:00:00Z' },
    ...over
  };
}

describe('Hudhud AI helpers', () => {
  it('hides the launcher where it would cover the work at hand', () => {
    expect(launcherHiddenOn('/admin/users')).toBeTrue();
    expect(launcherHiddenOn('/auth/login?returnUrl=%2F')).toBeTrue();
    expect(launcherHiddenOn('/property-form')).toBeTrue();
    expect(launcherHiddenOn('/properties/edit/1')).toBeTrue();
    expect(launcherHiddenOn('/')).toBeFalse();
    expect(launcherHiddenOn('/properties?listingType=ForRent')).toBeFalse();
    expect(launcherHiddenOn('/administration-guide')).toBeFalse();
  });

  it('turns an understood filter into readable chips', () => {
    const chips = aiFilterChips({
      listingType: 'ForSale', propertyTypeCode: 'residential-land', placeLabel: 'دمشق', minPrice: 50000, maxPrice: 80000,
      currencyCode: 'USD', currencyGuessed: true, floorFrom: 1, hasElevator: false, sortBy: 'Price', sortDescending: false
    });
    expect(chips.map(c => c.key)).toEqual([
      'AI.CHIP.FOR_SALE', 'AI.TYPE.RESIDENTIAL_LAND', 'AI.CHIP.PLACE', 'AI.CHIP.PRICE_BETWEEN',
      'AI.CHIP.FLOOR_NOT_GROUND', 'AI.CHIP.NO_ELEVATOR', 'AI.CHIP.SORT_PRICE_ASC'
    ]);
    expect(chips[3].guessed).toBeTrue();
    expect(aiFilterChips(null)).toEqual([]);
    expect(aiFilterChips({ floorFrom: 0, floorTo: 0 })[0].key).toBe('AI.CHIP.FLOOR_GROUND');
  });

  it('maps refusals to stable codes', () => {
    expect(aiErrorCode(new HttpErrorResponse({ status: 429, error: { code: 'AI_QUOTA_DAILY' } }))).toBe('AI_QUOTA_DAILY');
    expect(aiErrorCode(new HttpErrorResponse({ status: 429 }))).toBe('AI_RATE_LIMITED');
    expect(aiErrorCode(new HttpErrorResponse({ status: 0 }))).toBe('AI_OFFLINE');
    expect(aiErrorCode(new HttpErrorResponse({ status: 503, error: { code: 'AI_DISABLED' } }))).toBe('AI_DISABLED');
    expect(aiErrorCode(new HttpErrorResponse({ status: 500 }))).toBe('AI_FAILED');
    expect(aiErrorCode('boom')).toBe('AI_FAILED');
  });
});

describe('HudhudAiPanelComponent', () => {
  let api: jasmine.SpyObj<HudhudAiApiService>;
  let loggedIn: BehaviorSubject<boolean>;

  function create() {
    TestBed.configureTestingModule({
      imports: [HudhudAiPanelComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: HudhudAiApiService, useValue: api },
        { provide: AuthService, useValue: { isLoggedIn$: loggedIn.asObservable() } },
        { provide: LanguageService, useValue: { getCurrent: () => 'ar' } }
      ]
    });
    const fixture = TestBed.createComponent(HudhudAiPanelComponent);
    fixture.componentRef.setInput('status', STATUS);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    api = jasmine.createSpyObj('HudhudAiApiService', ['usage', 'send', 'conversations', 'conversation', 'deleteConversation', 'feedback']);
    api.usage.and.returnValue(of({ remainingToday: 5, remainingThisMonth: null, resetsAtUtc: '2026-11-18T00:00:00Z' }));
    loggedIn = new BehaviorSubject(false);
  });

  afterEach(() => document.body.style.removeProperty('overflow'));

  it('sends a guest message with the previous filter as the only context and renders text safely', () => {
    api.send.and.returnValue(of(answer()));
    const fixture = create();
    const panel = fixture.componentInstance;

    panel.draft.set('شقة للإيجار تحت 500 دولار');
    panel.submit();
    fixture.detectChanges();

    const [first, conversationId] = api.send.calls.mostRecent().args;
    expect(conversationId).toBeNull();
    expect(first.previousFilter).toBeNull();
    expect(first.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.ai-card__title')?.textContent).toContain('<b>شقة</b>');   // shown as text, never as markup
    expect(el.querySelector('.ai-card__title b')).toBeNull();

    panel.draft.set('مع مصعد');
    panel.submit();
    expect(api.send.calls.mostRecent().args[0].previousFilter).toEqual(answer().understoodFilter);
  });

  it('continues a signed-in conversation by id and sends no client-side context', () => {
    loggedIn.next(true);
    api.send.and.returnValue(of(answer({ conversationId: 'c1', messageId: 'm1' })));
    const fixture = create();
    const panel = fixture.componentInstance;

    panel.draft.set('شقة');
    panel.submit();
    panel.draft.set('أرخص');
    panel.submit();

    const [payload, conversationId] = api.send.calls.mostRecent().args;
    expect(conversationId).toBe('c1');
    expect(payload.previousFilter).toBeUndefined();
  });

  it('shows a quota refusal without a retry and keeps the remaining count', () => {
    api.send.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 429, error: { code: 'AI_QUOTA_DAILY', usage: { remainingToday: 0, remainingThisMonth: null, resetsAtUtc: '2026-11-18T00:00:00Z' } }
    })));
    const fixture = create();
    const panel = fixture.componentInstance;
    panel.draft.set('شقة');
    panel.submit();
    fixture.detectChanges();

    expect(panel.items()[0].failed?.code).toBe('AI_QUOTA_DAILY');
    expect(panel.usage()?.remainingToday).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('AI.ERROR.AI_QUOTA_DAILY');
    expect(fixture.nativeElement.textContent).not.toContain('AI.RETRY');
  });

  it('retries a failed message with the same client id', () => {
    api.send.and.returnValues(throwError(() => new HttpErrorResponse({ status: 0 })), of(answer()));
    const fixture = create();
    const panel = fixture.componentInstance;
    panel.draft.set('شقة');
    panel.submit();
    const firstId = api.send.calls.first().args[0].clientMessageId;

    panel.retry(panel.items()[0]);
    expect(api.send.calls.mostRecent().args[0].clientMessageId).toBe(firstId);
    expect(panel.items().length).toBe(2);
    expect(panel.items()[0].failed).toBeUndefined();
  });

  it('can stop waiting for an answer', () => {
    api.send.and.returnValue(NEVER);
    const fixture = create();
    const panel = fixture.componentInstance;
    panel.draft.set('شقة');
    panel.submit();
    expect(panel.busy()).toBeTrue();
    panel.stop();
    expect(panel.busy()).toBeFalse();
    expect(panel.items()[0].failed).toBeDefined();
  });

  it('compares two to four selected listings', () => {
    api.send.and.returnValue(of(answer()));
    const fixture = create();
    const panel = fixture.componentInstance;
    ['a', 'b', 'c', 'd', 'e'].forEach(id => panel.toggleSelected(id));
    expect(panel.selected()).toEqual(['a', 'b', 'c', 'd']);
    panel.compareSelected();
    expect(api.send.calls.mostRecent().args[0].compareIds).toEqual(['a', 'b', 'c', 'd']);
    expect(panel.selected()).toEqual([]);
  });

  it('refuses an over-long message and Escape closes the panel', () => {
    const fixture = create();
    const panel = fixture.componentInstance;
    panel.draft.set('x'.repeat(1001));
    expect(panel.canSend()).toBeFalse();

    let closed = false;
    panel.closed.subscribe(() => (closed = true));
    panel.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBeTrue();
  });

  it('only opens search links on the properties page', () => {
    const fixture = create();
    const panel = fixture.componentInstance;
    let closed = 0;
    panel.closed.subscribe(() => closed++);
    panel.openSearch('https://evil.example/properties');
    expect(closed).toBe(0);
  });
});
