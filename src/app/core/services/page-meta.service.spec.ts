import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PageMetaService } from './page-meta.service';
import { PropertyShareUrlService } from '../sharing/property-share-url.service';
import { environment } from '../../../environments/environment';

describe('PageMetaService', () => {
  let service: PageMetaService;
  let meta: Meta;
  let title: Title;
  let translate: TranslateService;
  let origin: string;
  let destroyCallbacks: Array<() => void>;
  let destroyRef: DestroyRef;
  let originalEnvironmentName: string;

  const canonical = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TranslateModule.forRoot()] });
    service = TestBed.inject(PageMetaService);
    meta = TestBed.inject(Meta);
    title = TestBed.inject(Title);
    translate = TestBed.inject(TranslateService);
    origin = TestBed.inject(PropertyShareUrlService).getSiteOrigin();

    translate.setTranslation('en', {
      SEO: { CONTACT: { TITLE: 'Contact us', DESCRIPTION: 'Get in touch <b>with</b> us' } }
    });
    translate.use('en');

    destroyCallbacks = [];
    destroyRef = { onDestroy: (cb: () => void) => { destroyCallbacks.push(cb); return () => undefined; } } as DestroyRef;

    originalEnvironmentName = environment.environmentName;
    // setPageRobots(null) only removes the tag in Production (elsewhere the global noindex stays).
    (environment as { environmentName: string }).environmentName = 'production';
    meta.removeTag('name="robots"');
    document.head.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
    document.head.querySelector('link[rel="canonical"]')?.remove();
  });

  it('applyTranslated sets title, sanitized description and an absolute canonical from the i18n keys', () => {
    service.applyTranslated('SEO.CONTACT', '/kontakt', destroyRef);

    expect(title.getTitle()).toBe('Contact us | HudhudNest');
    expect(meta.getTag('name="description"')?.content).toBe('Get in touch with us');
    expect(canonical()).toBe(`${origin}/kontakt`);
    expect(meta.getTag('property="og:url"')?.content).toBe(`${origin}/kontakt`);
  });

  it('applyTranslated removes the canonical again when the page is destroyed', () => {
    service.applyTranslated('SEO.CONTACT', '/kontakt', destroyRef);
    destroyCallbacks.forEach(cb => cb());

    expect(canonical()).toBeNull();
  });

  it('applyDynamic uses the entity data, caps the description at 160 chars and ignores a non-absolute image', () => {
    service.applyDynamic({
      title: 'Villa in Latakia',
      description: 'x'.repeat(400),
      path: '/short-stay/abc',
      image: '/relative/pic.jpg'
    });

    expect(meta.getTag('name="description"')?.content.length).toBe(160);
    expect(canonical()).toBe(`${origin}/short-stay/abc`);
    expect(meta.getTag('property="og:image"')?.content).toBe(`${origin}/images/og-default.png`);
  });

  it('applyDynamic clears a noindex left by an earlier failed load (retry that succeeds)', () => {
    service.markNotFound();
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');

    service.applyDynamic({ title: 'Villa', path: '/short-stay/abc' });

    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('noindex marks the page and restores the default when the page is destroyed', () => {
    service.noindex(destroyRef);
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');

    destroyCallbacks.forEach(cb => cb());

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});
