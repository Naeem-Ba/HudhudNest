import { ReferralCodeService } from './referral-code.service';

describe('ReferralCodeService (growth engine P5)', () => {
  let service: ReferralCodeService;

  beforeEach(() => {
    service = new ReferralCodeService();
    service.clear();
  });

  afterEach(() => service.clear());

  it('keeps a well-formed code, upper-cased', () => {
    service.captureFromUrl('https://hudhudnest.com/auth/register?ref=abcd2345');
    expect(service.current()).toBe('ABCD2345');
  });

  it('ignores malformed codes and keeps the previous one', () => {
    service.captureFromUrl('https://hudhudnest.com/?ref=ABCD2345');
    service.captureFromUrl('https://hudhudnest.com/?ref=<script>');
    service.captureFromUrl('https://hudhudnest.com/?ref=ABCD0000');
    expect(service.current()).toBe('ABCD2345');
  });

  it('forgets a code older than 30 days', () => {
    window.localStorage.setItem('hudhudnest.referral.v1', JSON.stringify({ code: 'ABCD2345', capturedAt: Date.now() - 31 * 864e5 }));
    expect(service.current()).toBeNull();
  });
});
