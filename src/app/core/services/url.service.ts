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

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return this.baseUrl + cleanPath;
  }


  /**
   * Builds an optimized Cloudinary delivery URL for a target display width.
   * Non-Cloudinary URLs are returned unchanged after normal URL resolution.
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

    const transformations = `f_auto,q_auto,w_${normalizedWidth},c_fill`;

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
