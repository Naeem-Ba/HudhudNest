import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EnumService } from '../core/services/enum.service';

@Pipe({
  name: 'enumTranslate',
  standalone: true,
  pure: false
})
export class EnumTranslatePipe implements PipeTransform {

  constructor(
    private enumService: EnumService,
    private translate: TranslateService
  ) {}

  transform(id: any | null | undefined, group: string): string {
    if (id == null || id === undefined || id === '') return '---';

    // إذا كانت String (مثل DAMASKUS)
  if (typeof id === 'string') {
    const tKey = `ENUM.${group}.${id}`;
    const translated = this.translate.instant(tKey);
    return translated !== tKey ? translated : id;
  }
  
     // إذا كانت Id
    const key = this.enumService.getKey(group, id);
    if (!key) return '-/-';

    const tKey = `ENUM.${group.toUpperCase()}.${key}`;
    const translated = this.translate.instant(tKey);

    return translated !== tKey ? translated : key;
  }
}
