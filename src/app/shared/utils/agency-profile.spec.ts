import { HttpErrorResponse } from '@angular/common/http';

import { AgencyWorkingDay } from '../../core/models/agency.model';
import {
  defaultWeek, isOpenNow, linkFieldErrors, normalizeWeek, officeClock, rangesText, safeHttps, socialHref, websiteLabel, weekError, whatsAppLink
} from './agency-profile';

describe('agency-profile utils', () => {
  it('builds wa.me links only from an international number', () => {
    expect(whatsAppLink('+963944123456')).toBe('https://wa.me/963944123456');
    expect(whatsAppLink('0944123456')).toBeNull();
    expect(whatsAppLink('javascript:alert(1)')).toBeNull();
    expect(whatsAppLink(null)).toBeNull();
  });

  it('never lets anything but https reach an href', () => {
    expect(safeHttps('https://office.example.sy/')).toBe('https://office.example.sy/');
    expect(safeHttps('http://office.example.sy/')).toBeNull();
    expect(safeHttps('javascript:alert(1)')).toBeNull();
    expect(safeHttps('not a url')).toBeNull();
    expect(socialHref({ network: 'Facebook', value: 'javascript:alert(1)' })).toBeNull();
    expect(socialHref({ network: 'Instagram', value: 'https://instagram.com/office' })).toBe('https://instagram.com/office');
    expect(socialHref({ network: 'WhatsApp', value: '+963944123456' })).toBe('https://wa.me/963944123456');
    expect(websiteLabel('https://www.office.example.sy/about')).toBe('office.example.sy');
  });

  it('starts a week Saturday first with Friday closed, and fills missing days as closed', () => {
    const week = defaultWeek();
    expect(week.map(d => d.day)).toEqual(['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(week[6].ranges).toEqual([]);
    expect(normalizeWeek(null)).toBeNull();
    expect(normalizeWeek([{ day: 'Monday', ranges: [{ opens: '10:00', closes: '12:00' }] }])!.find(d => d.day === 'Sunday')!.ranges).toEqual([]);
  });

  it('checks a week with the same rules as the server', () => {
    const week = defaultWeek();
    expect(weekError(week)).toBeNull();
    const withDay = (ranges: AgencyWorkingDay['ranges']) => week.map((d, i) => (i === 2 ? { ...d, ranges } : d));
    expect(weekError(withDay([{ opens: '17:00', closes: '09:00' }]))).toBe('OFFICE_PROFILE.HOURS_ERR_ORDER');
    expect(weekError(withDay([{ opens: '09:00', closes: '14:00' }, { opens: '13:00', closes: '18:00' }]))).toBe('OFFICE_PROFILE.HOURS_ERR_OVERLAP');
    expect(weekError(withDay([{ opens: '', closes: '18:00' }]))).toBe('OFFICE_PROFILE.HOURS_ERR_FORMAT');
    expect(weekError(withDay([{ opens: '17:00', closes: '24:00' }]))).toBeNull();
    expect(rangesText([{ opens: '09:00', closes: '14:00' }, { opens: '17:00', closes: '20:00' }])).toBe('09:00–14:00, 17:00–20:00');
  });

  it('says open or closed in Damascus time, whatever the device time zone', () => {
    const week = defaultWeek();
    // 2026-11-16 is a Monday. 07:30 UTC = 10:30 in Damascus (UTC+3): open. 15:30 UTC = 18:30: closed.
    expect(officeClock(new Date('2026-11-16T07:30:00Z'))).toEqual({ day: 'Monday', minutes: 10 * 60 + 30 });
    expect(isOpenNow(week, new Date('2026-11-16T07:30:00Z'))).toBeTrue();
    expect(isOpenNow(week, new Date('2026-11-16T15:30:00Z'))).toBeFalse();
    // Friday is closed all day.
    expect(isOpenNow(week, new Date('2026-11-20T09:00:00Z'))).toBeFalse();
    expect(isOpenNow(null, new Date())).toBeNull();
  });

  it('maps 422 codes to the field that was wrong, using the sent list for Links[i]', () => {
    const err = new HttpErrorResponse({
      status: 422,
      error: { errorCodes: { Website: ['AGENCY_WEBSITE_INVALID'], 'Links[1]': ['AGENCY_SOCIAL_INVALID'], 'Links[0]': ['AGENCY_SOCIAL_INVALID'] } }
    });
    const fields = linkFieldErrors(err, [{ network: 'WhatsApp' }, { network: 'Facebook' }])!;
    expect(fields.website).toBe('OFFICE_PROFILE.ERR_WEBSITE');
    expect(fields.links.Facebook).toBe('OFFICE_PROFILE.ERR_LINK');
    expect(fields.links.WhatsApp).toBe('OFFICE_PROFILE.ERR_WHATSAPP');
    expect(linkFieldErrors(new HttpErrorResponse({ status: 500 }), [])).toBeNull();
  });
});
