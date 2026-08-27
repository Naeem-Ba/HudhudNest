import { Injectable, inject } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BackendApiService } from '../api/backend-api.service';
import { LookupsApiService } from '../api/lookups-api.service';
export interface EnumItem {
  Id: number | string;
  Key: string;
}

@Injectable({ providedIn: 'root' })
export class EnumService {
  private readonly endpoint = '/enums';
  private readonly cache = new Map<string, EnumItem[]>();
  private readonly lookups = inject(LookupsApiService);

  /**
   * UI still uses the older German group names, while the backend now exposes
   * domain enum names. This map keeps the old templates working without calling
   * non-existing backend endpoints.
   */
  private readonly backendGroupByUiGroup: Record<string, string | null> = {
    STADT: null,
    ZUSTAND: 'PropertyCondition',
    STATUS: 'PropertyStatus',
    ENERGIEAUSWEISTYP: 'EnergyEfficiency',
    HEIZUNG: 'HeatingType',
    LISTINGTYPE: 'ListingType',
    PROPERTYCONDITION: 'PropertyCondition',
    PROPERTYSTATUS: 'PropertyStatus',
    ENERGYEFFICIENCY: 'EnergyEfficiency',
    HEATINGTYPE: 'HeatingType',
    // Dynamic listing form (ListingType × PropertyType redesign, Syrian
    // market) — "OwnershipType" is the product-facing name for the backend's
    // LegalStatusType, see EnumController's doc comment.
    OWNERSHIPTYPE: 'OwnershipType',
    AREAUNIT: 'AreaUnit',
    FURNISHINGSTATUS: 'FurnishingStatus'
  };

  constructor(private readonly api: BackendApiService) {}

  async loadAll(): Promise<void> {
    const groups = [
      'STADT', 'ZUSTAND', 'STATUS', 'ENERGIEAUSWEISTYP', 'HEIZUNG', 'LISTINGTYPE',
      'OWNERSHIPTYPE', 'AREAUNIT', 'FURNISHINGSTATUS'
    ];
    await Promise.all(groups.map(group => this.loadGroup(group)));
  }

  private async loadGroup(group: string): Promise<void> {
    const normalized = group.toUpperCase();
    const backendGroup = this.backendGroupByUiGroup[normalized] ?? group;

    if (normalized === 'STADT') {
      await this.loadCities();
      return;
    }

    if (!backendGroup) {
      this.cache.set(normalized, []);
      return;
    }

    try {
      const data = await firstValueFrom(
        this.api.get<unknown>(`${this.endpoint}/${backendGroup}`).pipe(
          map(response => this.normalize(response)),
          catchError(error => {
            console.warn(`Enum '${backendGroup}' could not be loaded. Using empty list.`, error);
            return of([] as EnumItem[]);
          })
        )
      );

      this.cache.set(normalized, data);
      this.cache.set(backendGroup.toUpperCase(), data);
    } catch {
      this.cache.set(normalized, []);
    }
  }

  getKey(group: string, id: number | string): string | null {
    const items = this.cache.get(group.toUpperCase());
    return items?.find(item => String(item.Id) === String(id))?.Key ?? null;
  }

  getList(group: string): EnumItem[] {
    return this.cache.get(group.toUpperCase()) ?? [];
  }

  private normalize(response: unknown): EnumItem[] {
    if (Array.isArray(response)) {
      return response.map((item, index) => this.toEnumItem(item, index));
    }

    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      const list = obj['items'] ?? obj['Items'] ?? obj['values'] ?? obj['Values'] ?? obj['data'] ?? obj['Data'];

      if (Array.isArray(list)) {
        return list.map((item, index) => this.toEnumItem(item, index));
      }
    }

    return [];
  }

  private toEnumItem(item: unknown, index: number): EnumItem {
    if (typeof item === 'string' || typeof item === 'number') {
      return { Id: item, Key: String(item) };
    }

    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const id = obj['Id'] ?? obj['id'] ?? obj['Value'] ?? obj['value'] ?? index;
      const key = obj['Key'] ?? obj['key'] ?? obj['Name'] ?? obj['name'] ?? obj['Label'] ?? obj['label'] ?? id;

      return {
        Id: id as string | number,
        Key: String(key)
      };
    }

    return { Id: index, Key: '' };
  }

  /**
   * ✅ إصلاح: كانت قائمة المدن (STADT) مكتوبة يدويًا (13 مدينة ثابتة) بدلاً من
   * استهلاك GET /api/lookups/cities الموجود فعليًا في الباك اند (LookupsController).
   * الآن تُجلب ديناميكيًا من الباك اند (وهي مبنية هناك من المدن الموجودة فعليًا
   * ضمن العقارات الحالية)، مع الاحتفاظ بقائمة احتياطية محلية صغيرة تُستخدم فقط
   * إذا فشل الطلب أو كانت قاعدة البيانات لا تزال فارغة (مثلاً عند أول تشغيل).
   */
  private async loadCities(): Promise<void> {
    try {
      const cities = await firstValueFrom(
        this.lookups.getCities().pipe(
          catchError(error => {
            console.warn('Lookups \'cities\' could not be loaded. Falling back to local list.', error);
            return of([] as { id: string; name: string }[]);
          })
        )
      );

      const items: EnumItem[] = cities.length > 0
        ? cities.map(city => ({ Id: city.id, Key: city.name }))
        : this.fallbackCities();

      this.cache.set('STADT', items);
    } catch {
      this.cache.set('STADT', this.fallbackCities());
    }
  }

  /** يُستخدم فقط كاحتياط عند تعذّر الوصول للباك اند أو عندما تكون قاعدة البيانات فارغة بعد. */
  private fallbackCities(): EnumItem[] {
    return [
      { Id: 'Damascus', Key: 'دمشق' },
      { Id: 'Aleppo', Key: 'حلب' },
      { Id: 'Homs', Key: 'حمص' },
      { Id: 'Hama', Key: 'حماة' },
      { Id: 'Latakia', Key: 'اللاذقية' },
      { Id: 'Tartus', Key: 'طرطوس' },
      { Id: 'Idlib', Key: 'إدلب' },
      { Id: 'Daraa', Key: 'درعا' },
      { Id: 'Dusseldorf', Key: 'دوسلدورف' },
      { Id: 'Essen', Key: 'إيسن' },
      { Id: 'Dortmund', Key: 'دورتموند' },
      { Id: 'Gelsenkirchen', Key: 'غيلسنكيرشن' },
      { Id: 'Berlin', Key: 'برلين' }
    ];
  }
}
