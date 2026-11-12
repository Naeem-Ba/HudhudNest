import { normalizeContact } from './waitlist.validation';

describe('normalizeContact', () => {
  it('accepts an email address and trims it', () => {
    expect(normalizeContact('  name@example.de ')).toEqual({ type: 'email', value: 'name@example.de' });
  });

  it('rejects malformed emails', () => {
    for (const bad of ['name@', '@example.de', 'name@example', 'na me@example.de', 'a@@b.de']) {
      expect(normalizeContact(bad)).withContext(bad).toBeNull();
    }
  });

  it('accepts a WhatsApp number with country code and normalises it to +digits', () => {
    expect(normalizeContact('+49 157 1234567')).toEqual({ type: 'whatsapp', value: '+491571234567' });
    expect(normalizeContact('0049 (157) 123-4567')).toEqual({ type: 'whatsapp', value: '+491571234567' });
    expect(normalizeContact('+963 11 123 4567')?.type).toBe('whatsapp');
  });

  it('accepts Arabic-Indic digits', () => {
    expect(normalizeContact('+٤٩ ١٥٧ ١٢٣٤٥٦٧')).toEqual({ type: 'whatsapp', value: '+491571234567' });
  });

  it('rejects a national number without a country code, too short or too long numbers, and empty input', () => {
    for (const bad of ['0157 1234567', '+49 12', '+1234567890123456', '', '   ', 'hello']) {
      expect(normalizeContact(bad)).withContext(bad).toBeNull();
    }
  });
});
