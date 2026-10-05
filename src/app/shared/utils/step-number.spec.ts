import { formatStepNumber } from './step-number';

describe('formatStepNumber', () => {
  it('uses Arabic-Indic digits in Arabic', () => {
    expect(formatStepNumber(1, 'ar')).toBe('١');
    expect(formatStepNumber(6, 'ar')).toBe('٦');
  });

  it('uses Western digits in English and German', () => {
    expect(formatStepNumber(2, 'en')).toBe('2');
    expect(formatStepNumber(5, 'de')).toBe('5');
  });
});
