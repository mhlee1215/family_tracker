import test from 'node:test';
import assert from 'node:assert/strict';
import { getDevAuthUser, isDevAdminUser } from '../src/server/auth.js';

test('dev auth exposes separate dev and test admin scopes', () => {
  const devAdmin = getDevAuthUser('admin-dev');
  const testAdmin = getDevAuthUser('admin-test');

  assert.equal(devAdmin.providerId, 'admin-dev');
  assert.equal(devAdmin.email, 'admin-dev@local.dev');
  assert.equal(devAdmin.familyId, 'family-admin-dev');
  assert.equal(testAdmin.providerId, 'admin-test');
  assert.equal(testAdmin.email, 'admin-test@local.dev');
  assert.equal(testAdmin.familyId, 'family-admin-test');
  assert.notEqual(devAdmin.familyId, testAdmin.familyId);
});

test('legacy admin id is rejected so tests cannot share the dev admin family', () => {
  assert.equal(getDevAuthUser('admin'), null);
  assert.equal(isDevAdminUser({ provider: 'dev', providerId: 'admin' }), false);
  assert.equal(isDevAdminUser(getDevAuthUser('admin-dev')), true);
  assert.equal(isDevAdminUser(getDevAuthUser('admin-test')), true);
});
