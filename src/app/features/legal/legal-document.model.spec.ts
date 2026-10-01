import { parseLegalText } from './legal-document.model';

describe('parseLegalText', () => {
  it('returns plain text unchanged', () => {
    expect(parseLegalText('hello')).toEqual([{ kind: 'text', text: 'hello' }]);
  });

  it('extracts route and mailto links', () => {
    const r = parseLegalText('See [Terms](/terms-of-service) or [mail](mailto:a@b.c).');
    expect(r).toEqual([
      { kind: 'text', text: 'See ' },
      { kind: 'route', text: 'Terms', href: '/terms-of-service' },
      { kind: 'text', text: ' or ' },
      { kind: 'mail', text: 'mail', href: 'mailto:a@b.c' },
      { kind: 'text', text: '.' }
    ]);
  });

  it('never turns external or scheme-relative targets into links', () => {
    const r = parseLegalText('[x](https://evil.example) [y](//evil.example) [z](javascript:alert(1))');
    expect(r.every(s => s.kind === 'text')).toBeTrue();
  });
});
