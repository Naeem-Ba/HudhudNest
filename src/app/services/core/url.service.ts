import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UrlService {

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

  /** بناء رابط مع منع الكاش */
  buildWithCacheBuster(path?: string): string | null {
    const url = this.build(path);
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  }
}
