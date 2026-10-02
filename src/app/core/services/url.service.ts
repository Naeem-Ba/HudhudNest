import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UrlService {

  private readonly cloudinaryUploadSegment = '/upload/';
  private readonly baseUrl = environment.baseUrl.replace(/\/$/, '');

  /** بناء رابط كامل لأي مسار */
  build(path?: string): string | null {
    if (!path) return null;

    // ✅ إذا كان الرابط كاملًا (Cloudinary / CDN / External)
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // The app's own bundled assets (e.g. the /images/no-image.svg placeholder) live on the web
    // origin, not the API origin. Prefixing them with baseUrl made the placeholder 404 on the split
    // Netlify/API deployment, and ImageFallbackDirective cannot recover because the failing src
    // already ends with its fallback path. The API serves nothing under /images/ (uploads are on
    // Cloudinary), so these paths are always local.
    if (path.startsWith('/images/')) {
      return path;
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return this.baseUrl + cleanPath;
  }


  /**
   * Builds an optimized Cloudinary delivery URL for a target display width.
   * Non-Cloudinary URLs are returned unchanged after normal URL resolution.
   *
   * c_limit (not c_fill): scales the stored original DOWN to at most `width`,
   * preserving its aspect ratio, and never upscales a smaller photo (c_fill with
   * only a width upscaled small uploads, which made them look soft/"compressed").
   * The display box, not the delivered file, decides any cropping (object-fit).
   */
  buildResponsiveUrl(path: string | null | undefined, width: number): string | null {
    const url = this.build(path ?? undefined);

    if (!url) {
      return null;
    }

    const normalizedWidth = Number.isFinite(width)
      ? Math.max(1, Math.round(width))
      : 1;

    if (!this.isCloudinaryUploadUrl(url)) {
      return url;
    }

    const transformations = `f_auto,q_auto,w_${normalizedWidth},c_limit`;

    return url.replace(
      this.cloudinaryUploadSegment,
      `${this.cloudinaryUploadSegment}${transformations}/`
    );
  }

  /** Builds a comma-separated srcset for responsive property images. */
  buildResponsiveSrcSet(
    path: string | null | undefined,
    widths: readonly number[]
  ): string | null {
    const baseUrl = this.build(path ?? undefined);

    if (!baseUrl || !this.isCloudinaryUploadUrl(baseUrl)) {
      return null;
    }

    const candidates = [...new Set(widths)]
      .filter(width => Number.isFinite(width) && width > 0)
      .sort((a, b) => a - b)
      .map(width => {
        const normalizedWidth = Math.round(width);
        const url = this.buildResponsiveUrl(path, normalizedWidth);

        return url ? `${url} ${normalizedWidth}w` : null;
      })
      .filter((candidate): candidate is string => candidate !== null);

    return candidates.length > 0 ? candidates.join(', ') : null;
  }

  private isCloudinaryUploadUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);

      return (
        parsedUrl.protocol === 'https:' &&
        parsedUrl.hostname === 'res.cloudinary.com' &&
        parsedUrl.pathname.includes(this.cloudinaryUploadSegment)
      );
    } catch {
      return false;
    }
  }

  /** بناء رابط مع منع الكاش */
  buildWithCacheBuster(path?: string): string | null {
    const url = this.build(path);
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  }
}
