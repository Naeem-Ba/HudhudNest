import { TestBed } from '@angular/core/testing';
import { Meta } from '@angular/platform-browser';
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
