import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkDeployContext } from './deploy-context-guard.mjs';

const STAGING_API = 'https://propertyapi-staging-api.onrender.com/api';
const PROD_API = 'https://wohnungen-api.onrender.com/api';

test('production context with the Staging API is rejected (the 2026-09-30 incident)', () => {
  assert.equal(checkDeployContext({ CONTEXT: 'production' }, { API_URL: STAGING_API }).length, 1);
});

test('production context with the production API or no API_URL is fine', () => {
  assert.deepEqual(checkDeployContext({ CONTEXT: 'production' }, { API_URL: PROD_API }), []);
  assert.deepEqual(checkDeployContext({ CONTEXT: 'production' }, { API_URL: '' }), []);
});

test('production context with a netlify.app SITE_URL is rejected', () => {
  assert.equal(
    checkDeployContext({ CONTEXT: 'production' }, { SITE_URL: 'https://staging--hudhudnest.netlify.app' }).length,
    1
  );
});

test('deploy previews and the staging branch must not use the Production API', () => {
  assert.equal(checkDeployContext({ CONTEXT: 'deploy-preview' }, { API_URL: PROD_API }).length, 1);
  assert.equal(checkDeployContext({ CONTEXT: 'branch-deploy', BRANCH: 'staging' }, { API_URL: PROD_API }).length, 1);
  assert.deepEqual(checkDeployContext({ CONTEXT: 'deploy-preview' }, { API_URL: STAGING_API }), []);
});

test('non-Netlify builds (no CONTEXT) are never blocked', () => {
  assert.deepEqual(checkDeployContext({}, { API_URL: STAGING_API }), []);
  assert.deepEqual(checkDeployContext({}, { API_URL: PROD_API }), []);
});

test('other branch deploys are not treated as staging builds', () => {
  assert.deepEqual(checkDeployContext({ CONTEXT: 'branch-deploy', BRANCH: 'feature/x' }, { API_URL: PROD_API }), []);
});
