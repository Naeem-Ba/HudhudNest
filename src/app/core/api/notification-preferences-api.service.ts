import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { BackendApiService } from './backend-api.service';

export type PushPreviewLevel = 'Generic' | 'Full';

export interface NotificationCategoryInfo {
  id: string;
  /** False when every event of the category is mandatory (account safety etc.): the switch is not offered. */
  mutable: boolean;
}

export interface NotificationPreferences {
  mutedCategories: string[];
  pushMutedCategories: string[];
  pushPreview: PushPreviewLevel;
  quietStartMinute: number | null;
  quietEndMinute: number | null;
  timeZoneId: string | null;
  categories: NotificationCategoryInfo[];
}

/** Partial update: a field left out keeps its saved value. */
export interface NotificationPreferencesUpdate {
  mutedCategories?: string[];
  pushMutedCategories?: string[];
  pushPreview?: PushPreviewLevel;
  quietHoursEnabled?: boolean;
  quietStartMinute?: number;
  quietEndMinute?: number;
  timeZoneId?: string;
}

/** GET/PUT /notifications/preferences. The user comes from the token, never from the request. */
@Injectable({ providedIn: 'root' })
export class NotificationPreferencesApiService {
  constructor(private readonly api: BackendApiService) {}

  get(): Observable<NotificationPreferences> {
    return this.api.get<NotificationPreferences>('/notifications/preferences');
  }

  update(change: NotificationPreferencesUpdate): Observable<NotificationPreferences> {
    return this.api.put<NotificationPreferences>('/notifications/preferences', change);
  }
}

/** "07:30" -> 450 */
export function timeToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minute : null;
}

/** 450 -> "07:30" (empty when unset) */
export function minuteToTime(minute: number | null): string {
  if (minute === null || minute < 0 || minute > 1439) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}
