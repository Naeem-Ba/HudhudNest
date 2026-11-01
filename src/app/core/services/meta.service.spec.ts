import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { MetaService } from './meta.service';
import { environment } from '../../../environments/environment';

describe('MetaService.applyGlobalRobotsPolicy', () => {
  let service: MetaService;
  let meta: Meta;
  let originalEnvironmentName: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    meta = TestBed.inject(Meta);
    originalEnvironmentName = environment.environmentName;
    meta.removeTag('name="robots"');
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
  });

  it('sets a noindex,nofollow robots tag outside Production', () => {
    (environment as { environmentName: string }).environmentName = 'staging';

    service.applyGlobalRobotsPolicy();

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('sets a noindex,nofollow robots tag for a local build too', () => {
    (environment as { environmentName: string }).environmentName = 'local';

    service.applyGlobalRobotsPolicy();

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('does not add a robots tag in Production', () => {
    (environment as { environmentName: string }).environmentName = 'production';

    service.applyGlobalRobotsPolicy();

    expect(meta.getTag('name="robots"')).toBeNull();
  });
});

describe('MetaService.setPageRobots', () => {
  let service: MetaService;
  let meta: Meta;
  let originalEnvironmentName: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    meta = TestBed.inject(Meta);
    originalEnvironmentName = environment.environmentName;
    meta.removeTag('name="robots"');
  });

  afterEach(() => {
    (environment as { environmentName: string }).environmentName = originalEnvironmentName;
    meta.removeTag('name="robots"');
  });

  it('sets the given robots content', () => {
    service.setPageRobots('noindex, nofollow');
    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });

  it('clearing (null) removes the tag in Production', () => {
    (environment as { environmentName: string }).environmentName = 'production';
    service.setPageRobots('noindex, nofollow');

    service.setPageRobots(null);

    expect(meta.getTag('name="robots"')).toBeNull();
  });

  it('clearing (null) outside Production leaves the global noindex policy\'s tag alone', () => {
    (environment as { environmentName: string }).environmentName = 'staging';
    service.applyGlobalRobotsPolicy();

    service.setPageRobots(null);

    expect(meta.getTag('name="robots"')?.content).toBe('noindex, nofollow');
  });
});

describe('MetaService.clearCanonical', () => {
  let service: MetaService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('removes an existing canonical link entirely', () => {
    service.setMeta({ title: 't', description: 'd', canonical: 'https://hudhudnest.com/properties/p1' });
    expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();

    service.clearCanonical();

    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it('is a no-op when there is no canonical link to remove', () => {
    expect(() => service.clearCanonical()).not.toThrow();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });
});

describe('MetaService.setMeta language and ownership', () => {
  let service: MetaService;
  let meta: Meta;
  let title: Title;
  let originalLang: string;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MetaService);
    meta = TestBed.inject(Meta);
    title = TestBed.inject(Title);
    originalLang = document.documentElement.lang;
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  afterEach(() => {
    document.documentElement.lang = originalLang;
    document.querySelector('link[rel="canonical"]')?.remove();
  });

  it('suffixes the title with the Arabic brand in Arabic and HudhudNest in English and German', () => {
    document.documentElement.lang = 'ar';
    service.setMeta({ title: 'عقارات', description: 'd' });
    expect(title.getTitle()).toBe('عقارات | هدهد نيست');
    expect(meta.getTag('property="og:locale"')?.content).toBe('ar_SY');

    document.documentElement.lang = 'de';
    service.setMeta({ title: 'Immobilien', description: 'd' });
    expect(title.getTitle()).toBe('Immobilien | HudhudNest');
    expect(meta.getTag('property="og:locale"')?.content).toBe('de_DE');

    document.documentElement.lang = 'en';
    service.setMeta({ title: 'Properties', description: 'd' });
    expect(meta.getTag('property="og:locale"')?.content).toBe('en_US');
  });

  it('a page owns the title until releasePage(); a default never takes ownership', () => {
    service.setMeta({ title: 'Page', description: 'd' });
    expect(service.isPageOwned).toBeTrue();

    service.releasePage();
    service.setMeta({ title: 'Default', description: 'd', isDefault: true });
    expect(service.isPageOwned).toBeFalse();
  });

  it('setLandingMeta describes the live offer', () => {
    service.setLandingMeta({ offerName: 'Early offer', offerDescription: '25% off' });
    expect(title.getTitle()).toContain('Early offer');
    expect(meta.getTag('name="description"')?.content).toBe('Early offer — 25% off');
  });
});
