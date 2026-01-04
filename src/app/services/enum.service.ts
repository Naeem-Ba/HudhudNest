import { Injectable } from '@angular/core';
import { Observable, of, firstValueFrom } from 'rxjs';
import { tap, shareReplay } from 'rxjs/operators';
import { ApiService } from './core/api.service';


export interface EnumItem {
  Id: number;
  Key: string;
}

@Injectable({ providedIn: 'root' })
export class EnumService {

  private readonly endpoint = '/enums';
  private cache = new Map<string, EnumItem[]>();

  constructor( private api: ApiService) {}

  async loadAll(): Promise<void> {
    const groups = ['STADT', 'ZUSTAND', 'STATUS', 'ENERGIEAUSWEISTYP'];
    const promises = groups.map(g => 
      firstValueFrom(this.api.get<EnumItem[]>(`${this.endpoint}/${g.toUpperCase()}`))
        .then(data => {
          this.cache.set(g.toUpperCase(), data);
        })
    );
    await Promise.all(promises);
  }

  getKey(group: string, id: number | string): string | null {
    const items = this.cache.get(group.toUpperCase());
    // نستخدم == للمقارنة لتجنب مشاكل string vs number
    return items?.find(x => x.Id == id)?.Key ?? null;
  }

  getList(group: string): EnumItem[] {
    return this.cache.get(group.toUpperCase()) ?? [];
  }
}
