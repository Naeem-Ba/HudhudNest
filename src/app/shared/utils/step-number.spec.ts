import { formatStepNumber } from './step-number';

describe('formatStepNumber', () => {
  it('uses Latin digits in Arabic too (one digit system on every screen)', () => {
    expect(formatStepNumber(1, 'ar')).toBe('1');
    expect(formatStepNumber(6, 'ar')).toBe('6');
  });

  it('uses Western digits in English and German', () => {
    expect(formatStepNumber(2, 'en')).toBe('2');
    expect(formatStepNumber(5, 'de')).toBe('5');
  });
});
