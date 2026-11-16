import { Agency } from '../models/agency.model';
import { AGENCY_GRACE_DAYS, agencyGrace } from './agency-grace';

const NOW = new Date('2026-11-07T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const agency = (status: string | null, expires: string | null): Agency =>
  ({ ownerPlanStatus: status, ownerPlanExpiresAt: expires } as Agency);

describe('agencyGrace', () => {
  it('is active for an owner plan that expired 10 days ago, with the days that remain', () => {
    const grace = agencyGrace(agency('Expired', daysAgo(10)), NOW);
    expect(grace.active).toBeTrue();
    expect(grace.daysLeft).toBe(AGENCY_GRACE_DAYS - 10);
    expect(grace.endsAt).not.toBeNull();
  });

  it('is active on the day the plan ended (full period left)', () => {
    expect(agencyGrace(agency('Expired', daysAgo(0.01)), NOW).daysLeft).toBe(AGENCY_GRACE_DAYS);
  });

  it('is over after 30 days', () => {
    expect(agencyGrace(agency('Expired', daysAgo(AGENCY_GRACE_DAYS + 1)), NOW).active).toBeFalse();
    expect(agencyGrace(agency('Expired', daysAgo(AGENCY_GRACE_DAYS)), NOW).active).toBeFalse();
  });

  it('never applies to a plan in force, no plan, a cancelled plan, or a missing/invalid date', () => {
    expect(agencyGrace(agency('Active', daysAgo(1)), NOW).active).toBeFalse();
    expect(agencyGrace(agency('NoPlan', null), NOW).active).toBeFalse();
    expect(agencyGrace(agency('Cancelled', daysAgo(1)), NOW).active).toBeFalse();
    expect(agencyGrace(agency('Expired', null), NOW).active).toBeFalse();
    expect(agencyGrace(agency('Expired', 'not a date'), NOW).active).toBeFalse();
    expect(agencyGrace(null, NOW).active).toBeFalse();
  });
});
