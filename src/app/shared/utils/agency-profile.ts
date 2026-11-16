// src/app/shared/utils/agency-profile.ts
//
// ملف المكتب (P4): روابط التواصل وساعات العمل. دوال نقية حتى تُختبر وحدها وتُستعمل في لوحة المالك والصفحة العامة.
import { HttpErrorResponse } from '@angular/common/http';

import {
  AgencySocialLink,
  AgencySocialNetwork,
  AgencyTimeRange,
  AgencyWorkingDay,
  WEEK_DAYS,
  WeekDay
} from '../../core/models/agency.model';

/** المكاتب في سوريا: الساعات تُكتب بتوقيت دمشق، فـ«مفتوح الآن» يُحسب به مهما كان توقيت جهاز الزائر. */
export const OFFICE_TIME_ZONE = 'Asia/Damascus';

/** رابط واتساب من الرقم الدولي المخزَّن (+963…). null لقيمة لا تشبه رقمًا دوليًا. */
export function whatsAppLink(phone: string | null | undefined): string | null {
  if (!phone || !/^\+[1-9][0-9]{7,14}$/.test(phone)) return null;
  return `https://wa.me/${phone.slice(1)}`;
}

/**
 * الرابط الذي يُفتح عند النقر. الخادم يخزّن روابط https على نطاق الشبكة فقط، لكن نتحقق هنا أيضًا كي لا يصل
 * أي شيء آخر إلى href مهما وصل من الخادم.
 */
export function socialHref(link: AgencySocialLink): string | null {
  if (link.network === 'WhatsApp') return whatsAppLink(link.value);
  return safeHttps(link.value);
}

export function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** نص قصير يظهر للموقع: النطاق بلا www. */
export function websiteLabel(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

/** أسبوع افتراضي للتحرير: من السبت إلى الخميس 9:00–17:00، والجمعة مغلق. */
export function defaultWeek(): AgencyWorkingDay[] {
  return WEEK_DAYS.map(day => ({ day, ranges: day === 'Friday' ? [] : [{ opens: '09:00', closes: '17:00' }] }));
}

/** الأيام السبعة بترتيب السبت أولًا، مع إكمال أي يوم ناقص كمغلق (لا يحدث مع خادمنا، لكنه يحمي العرض). */
export function normalizeWeek(days: AgencyWorkingDay[] | null | undefined): AgencyWorkingDay[] | null {
  if (!days || days.length === 0) return null;
  return WEEK_DAYS.map(day => ({ day, ranges: (days.find(d => d.day === day)?.ranges ?? []).map(r => ({ ...r })) }));
}

/** سبب أول خطأ في الأسبوع قبل إرساله (نفس قواعد الخادم)، أو null إن كان سليمًا. يعيد مفتاح ترجمة. */
export function weekError(days: AgencyWorkingDay[]): string | null {
  for (const d of days) {
    if (d.ranges.length > 2) return 'OFFICE_PROFILE.HOURS_ERR_TOO_MANY';
    let previous = -1;
    for (const r of d.ranges) {
      const opens = minutes(r.opens, false);
      const closes = minutes(r.closes, true);
      if (opens === null || closes === null) return 'OFFICE_PROFILE.HOURS_ERR_FORMAT';
      if (opens >= closes) return 'OFFICE_PROFILE.HOURS_ERR_ORDER';
      if (opens < previous) return 'OFFICE_PROFILE.HOURS_ERR_OVERLAP';
      previous = closes;
    }
  }
  return null;
}

function minutes(value: string, allowMidnightEnd: boolean): number | null {
  if (allowMidnightEnd && value === '24:00') return 24 * 60;
  const m = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export interface OfficeClock {
  day: WeekDay;
  minutes: number;
}

/** اليوم والدقيقة الآن بتوقيت المكتب. */
export function officeClock(now: Date, timeZone = OFFICE_TIME_ZONE): OfficeClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { day: get('weekday') as WeekDay, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** هل المكتب مفتوح الآن؟ null إن لم يحدد ساعاته (لا نخمّن). */
export function isOpenNow(days: AgencyWorkingDay[] | null | undefined, now: Date, timeZone = OFFICE_TIME_ZONE): boolean | null {
  const week = normalizeWeek(days);
  if (!week) return null;
  const clock = officeClock(now, timeZone);
  const today = week.find(d => d.day === clock.day);
  return (today?.ranges ?? []).some(r => {
    const opens = minutes(r.opens, false);
    const closes = minutes(r.closes, true);
    return opens !== null && closes !== null && clock.minutes >= opens && clock.minutes < closes;
  });
}

/** "09:00–14:00، 17:00–20:00" (الأرقام بالشكل اللاتيني كما في بقية التطبيق). */
export function rangesText(ranges: AgencyTimeRange[], separator = ', '): string {
  return ranges.map(r => `${r.opens}–${r.closes}`).join(separator);
}

export interface ProfileFieldErrors {
  website: string | null;
  links: Partial<Record<AgencySocialNetwork, string>>;
}

/**
 * أخطاء 422 من PUT /links لكل حقل: errorCodes مفهرسة باسم الخاصية (Website، Links[2]). Links[i] يشير إلى
 * العنصر i من القائمة المرسلة، فنحتاج القائمة نفسها لنعرف الشبكة. يعيد مفاتيح ترجمة.
 */
export function linkFieldErrors(error: unknown, sent: { network: AgencySocialNetwork }[]): ProfileFieldErrors | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) return null;
  const codes = (error.error as { errorCodes?: Record<string, string[]> } | null)?.errorCodes;
  if (!codes) return null;

  const result: ProfileFieldErrors = { website: null, links: {} };
  for (const [key, list] of Object.entries(codes)) {
    const code = list?.[0];
    if (!code) continue;
    if (/^website$/i.test(key)) {
      result.website = 'OFFICE_PROFILE.ERR_WEBSITE';
      continue;
    }
    const m = /^links\[(\d+)\]/i.exec(key);
    const network = m ? sent[Number(m[1])]?.network : undefined;
    if (network) result.links[network] = network === 'WhatsApp' ? 'OFFICE_PROFILE.ERR_WHATSAPP' : 'OFFICE_PROFILE.ERR_LINK';
  }
  return result;
}
