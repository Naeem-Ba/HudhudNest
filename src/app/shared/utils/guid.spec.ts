import { isGuid } from './guid';

describe('isGuid', () => {
  it('accepts canonical GUIDs in any case', () => {
    expect(isGuid('97b1c2a6-ceba-4d23-8c3e-4df13a2efd74')).toBeTrue();
    expect(isGuid('97B1C2A6-CEBA-4D23-8C3E-4DF13A2EFD74')).toBeTrue();
    expect(isGuid('00000000-0000-0000-0000-000000000000')).toBeTrue();
  });

  it('rejects everything else', () => {
    for (const bad of ['', 'not-a-guid', '123', '97b1c2a6ceba4d238c3e4df13a2efd74', '97b1c2a6-ceba-4d23-8c3e-4df13a2efd7', ' 97b1c2a6-ceba-4d23-8c3e-4df13a2efd74']) {
      expect(isGuid(bad)).withContext(bad).toBeFalse();
    }
    expect(isGuid(null)).toBeFalse();
    expect(isGuid(undefined)).toBeFalse();
  });
});
