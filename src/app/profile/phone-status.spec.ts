import { phoneStatus } from './phone-status';

describe('phoneStatus', () => {
  it('is "none" for an account without a number, and offers the code flow only with a password', () => {
    expect(phoneStatus({ Phone: '', PhoneConfirmed: false, HasPassword: true })).toEqual({
      kind: 'none', phone: null, canConfirm: true, needsPassword: false
    });
    expect(phoneStatus({ Phone: null, HasPassword: false })).toEqual({
      kind: 'none', phone: null, canConfirm: false, needsPassword: true
    });
  });

  it('is "unconfirmed" for a stored number nobody proved, and says so even when the number is blank-padded', () => {
    expect(phoneStatus({ Phone: ' +963911234567 ', PhoneConfirmed: false, HasPassword: true })).toEqual({
      kind: 'unconfirmed', phone: '+963911234567', canConfirm: true, needsPassword: false
    });
  });

  it('cannot confirm without a password (Google or Apple sign-in)', () => {
    const status = phoneStatus({ Phone: '+963911234567', PhoneConfirmed: false, HasPassword: false });
    expect(status.kind).toBe('unconfirmed');
    expect(status.canConfirm).toBeFalse();
    expect(status.needsPassword).toBeTrue();
  });

  it('is "confirmed" for a proven number, with nothing left to confirm', () => {
    expect(phoneStatus({ Phone: '+963911234567', PhoneConfirmed: true, HasPassword: false })).toEqual({
      kind: 'confirmed', phone: '+963911234567', canConfirm: false, needsPassword: false
    });
  });

  it('treats a missing profile as "none"', () => {
    expect(phoneStatus(null).kind).toBe('none');
    expect(phoneStatus(undefined).phone).toBeNull();
  });
});
