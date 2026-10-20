import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findKeyLiterals, flattenKeys, missingKeys, parityGaps } from './i18n-keys.mjs';

test('flattenKeys lists leaf keys with dotted paths', () => {
  assert.deepEqual(flattenKeys({ A: { B: 'x', C: { D: 'y' } }, E: 'z' }), ['A.B', 'A.C.D', 'E']);
});

test('findKeyLiterals finds complete keys and skips runtime-built prefixes', () => {
  const source = `x = 'SHORTSTAY.STATUS.PENDING'; y = "REVIEW.COMMENT_TOO_LONG"; z = \`CHECKOUT.STEP_\${n}\`; v = 'PROPERTY_FORM.OWNERSHIP_' + o; w = 'Plain text.'`;
  assert.deepEqual(findKeyLiterals(source), ['SHORTSTAY.STATUS.PENDING', 'REVIEW.COMMENT_TOO_LONG']);
});

test('missingKeys reports a key under the wrong section and accepts whole sections', () => {
  const available = ['SHORTSTAY.BOOKINGS.STATUS.PENDING', 'REVIEW.RATING_RANGE'];
  assert.deepEqual(
    missingKeys(['SHORTSTAY.STATUS.PENDING', 'SHORTSTAY.BOOKINGS.STATUS', 'REVIEW.RATING_RANGE'], available),
    ['SHORTSTAY.STATUS.PENDING']
  );
});

test('parityGaps reports keys one language lacks', () => {
  assert.deepEqual(parityGaps({ en: ['A.B', 'A.C'], de: ['A.B'] }), [{ from: 'en', to: 'de', missing: ['A.C'] }]);
});
