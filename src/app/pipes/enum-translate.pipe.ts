import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EnumService } from '../services/enum.service';

@Pipe({
  name: 'enumTranslate',
  standalone: true,
  pure: false // مهم جداً لأن الترجمة قد تتغير أو البيانات قد تتأخر
})
export class EnumTranslatePipe implements PipeTransform {

  constructor(
    private translate: TranslateService,
    private enumService: EnumService //  حقن الخدمة
  ) {}

  transform(id: any, group: string): string {
    if (id === null || id === undefined) return '';

    // بناء المفتاح بناءً على الـ ID ليتطابق مع ملف JSON
    // مثال: ENUM.STADT.0
    const translationKey = `ENUM.${group.toUpperCase()}.${id}`;

    // محاولة الترجمة
    const translated = this.translate.instant(translationKey);

    // إذا لم يجد الترجمة (أي أعاد المفتاح نفسه)، نعيد النص الأصلي أو فارغ
    return translated !== translationKey ? translated : `ID: ${id}`;
  }
  
}