import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NotFoundPage } from './not-found.page';
import { environment } from '../../../environments/environment';

describe('NotFoundPage', () => {
  let fixture: ComponentFixture<NotFoundPage>;
  let meta: Meta;
  let originalEnvironmentName: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFoundPage, TranslateModule.forRoot()],
      providers: [provideRouter([])]
    }).compileComponents();

    meta = TestBed.inject(Meta);
    originalEnvironmentName = environment.environmentName;
    (environment as { environmentName: string }).environmentName = 'production';
    meta.removeTag('name="robots"');
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
  });

  it('sets noindex, nofollow so a dead link never gets indexed', () => {
    fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('clears the robots tag again once the page is left (no leak onto the next route)', () => {
    fixture = TestBed.createComponent(NotFoundPage);
    fixture.detectChanges();
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');

    fixture.destroy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});
