import { Injectable } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { BackendApiService } from '../core/services/backend-api.service';

export interface EnumItem {
  Id: number | string;
  Key: string;
}

@Injectable({ providedIn: 'root' })
export class EnumService {
  private readonly endpoint = '/enums';
  private readonly cache = new Map<string, EnumItem[]>();

  constructor(private readonly api: BackendApiService) {}

  async loadAll(): Promise<void> {
    const groups = ['STADT', 'ZUSTAND', 'STATUS', 'ENERGIEAUSWEISTYP'];
    await Promise.all(groups.map(group => this.loadGroup(group)));
  }

  private async loadGroup(group: string): Promise<void> {
    const normalized = group.toUpperCase();

    if (normalized === 'STADT') {
      this.cache.set(normalized, this.localCities());
      return;
    }

    try {
      const data = await firstValueFrom(
        this.api.get<unknown>(`${this.endpoint}/${normalized}`).pipe(
          map(response => this.normalize(response)),
          catchError(error => {
            console.warn(`Enum '${normalized}' could not be loaded. Using empty list.`, error);
            return of([] as EnumItem[]);
          })
        )
      );

      this.cache.set(normalized, data);
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
      const list = obj['items'] ?? obj['Items'] ?? obj['values'] ?? obj['Values'];

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

  private localCities(): EnumItem[] {
    return [
      { Id: 'Damascus', Key: '\u062F\u0645\u0634\u0642' },
      { Id: 'Aleppo', Key: '\u062D\u0644\u0628' },
      { Id: 'Homs', Key: '\u062D\u0645\u0635' },
      { Id: 'Hama', Key: '\u062D\u0645\u0627\u0629' },
      { Id: 'Latakia', Key: '\u0627\u0644\u0644\u0627\u0630\u0642\u064A\u0629' },
      { Id: 'Tartus', Key: '\u0637\u0631\u0637\u0648\u0633' },
      { Id: 'Idlib', Key: '\u0625\u062F\u0644\u0628' },
      { Id: 'Daraa', Key: '\u062F\u0631\u0639\u0627' },
      { Id: 'Dusseldorf', Key: '\u062F\u0648\u0633\u0644\u062F\u0648\u0631\u0641' },
      { Id: 'Essen', Key: '\u0625\u064A\u0633\u0646' },
      { Id: 'Dortmund', Key: '\u062F\u0648\u0631\u062A\u0645\u0648\u0646\u062F' },
      { Id: 'Gelsenkirchen', Key: '\u063A\u064A\u0644\u0633\u0646\u0643\u064A\u0631\u0634\u0646' },
      { Id: 'Berlin', Key: '\u0628\u0631\u0644\u064A\u0646' }
    ];
  }
}