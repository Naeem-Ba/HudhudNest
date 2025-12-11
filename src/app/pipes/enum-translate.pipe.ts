import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Pipe({ name: 'enumTranslate', standalone: true })
export class EnumTranslatePipe implements PipeTransform {
  constructor(private translate: TranslateService) {}

  transform(value: number | string | null | undefined, enumGroup: string, fallback?: string): string {
    if (value === null || value === undefined || value === '') return '';
    const key = `ENUM.${enumGroup}.${String(value)}`;
    // instant returns key itself if not found
    const translated = this.translate.instant(key);
    if (!translated || translated === key) return fallback ?? String(value);
    return translated;
  }
}