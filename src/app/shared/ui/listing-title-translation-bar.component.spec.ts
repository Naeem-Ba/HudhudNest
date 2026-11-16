import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { ListingTitleTranslationService } from '../../core/api/listing-title-translation.service';
import { ListingTitleTranslationBarComponent } from './listing-title-translation-bar.component';

describe('ListingTitleTranslationBarComponent', () => {
  let fixture: ComponentFixture<ListingTitleTranslationBarComponent>;
  let translated = false;
  let original = false;
  const toggleOriginal = jasmine.createSpy('toggleOriginal');

  beforeEach(() => {
    translated = false;
    original = false;
    toggleOriginal.calls.reset();
    TestBed.configureTestingModule({
      imports: [ListingTitleTranslationBarComponent, TranslateModule.forRoot()],
      providers: [{
        provide: ListingTitleTranslationService,
        useValue: { hasTranslation: () => translated, showingOriginal: () => original, toggleOriginal }
      }]
    });
    fixture = TestBed.createComponent(ListingTitleTranslationBarComponent);
    fixture.componentRef.setInput('items', [{ id: 'a', title: 'x' }]);
    fixture.componentRef.setInput('kind', 'property');
  });

  it('shows nothing when no title on the page is translated', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="title-translation-bar"]')).toBeNull();
  });

  it('shows the label and a toggle that flips between translation and original', () => {
    translated = true;
    fixture.detectChanges();
    const bar = fixture.nativeElement.querySelector('[data-testid="title-translation-bar"]');
    expect(bar.textContent).toContain('PROPERTY_DETAIL.TRANSLATION.AUTO_LABEL');
    expect(bar.textContent).toContain('PROPERTY_DETAIL.TRANSLATION.SHOW_ORIGINAL');

    fixture.nativeElement.querySelector('[data-testid="title-translation-toggle"]').click();
    expect(toggleOriginal).toHaveBeenCalledTimes(1);
  });

  it('says so when the original is being shown', () => {
    translated = true;
    original = true;
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('PROPERTY_DETAIL.TRANSLATION.SHOWING_ORIGINAL');
    expect(text).toContain('PROPERTY_DETAIL.TRANSLATION.SHOW_TRANSLATION');
  });
});
