import { TestBed } from '@angular/core/testing';
import { UrlService } from './url.service';
import { environment } from '../../../environments/environment';

describe('UrlService', () => {
  let service: UrlService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UrlService);
  });

  it('keeps the bundled placeholder on the web origin instead of prefixing the API origin', () => {
    // Regression: with a split web/API deployment the placeholder resolved to <api>/images/no-image.svg,
    // which 404s, and ImageFallbackDirective cannot recover because that src already ends with its fallback.
    expect(service.build('/images/no-image.svg')).toBe('/images/no-image.svg');
    expect(service.buildResponsiveUrl('/images/no-image.svg', 640)).toBe('/images/no-image.svg');
  });

  it('still resolves other relative paths against the backend origin', () => {
    const base = environment.baseUrl.replace(/\/$/, '');

    expect(service.build('/uploads/a.jpg')).toBe(`${base}/uploads/a.jpg`);
    expect(service.build('uploads/a.jpg')).toBe(`${base}/uploads/a.jpg`);
  });

  it('returns absolute URLs untouched', () => {
    expect(service.build('https://res.cloudinary.com/x/image/upload/a.jpg')).toBe(
      'https://res.cloudinary.com/x/image/upload/a.jpg'
    );
  });
});
