import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createUniquePlayStorageState, decryptStorageState, encryptStorageState } from '../src/session.mjs';

test('browser storage state is encrypted with authenticated encryption', () => {
  const key = randomBytes(32).toString('base64');
  const state = { cookies: [{ name: 'session', value: 'secret-cookie' }], origins: [] };
  const encrypted = encryptStorageState(state, key);

  assert.equal(encrypted.includes('secret-cookie'), false);
  assert.deepEqual(decryptStorageState(encrypted, key), state);
  assert.throws(() => decryptStorageState(encrypted, randomBytes(32).toString('base64')));
});

test('session capture keeps only UniquePlay auth state', () => {
  const state = createUniquePlayStorageState({
    cookies: [
      { domain: '.unique-play.com', name: 'up-cookie', value: 'allowed' },
      { domain: '.google.com', name: 'SID', value: 'private-google-cookie' },
    ],
    origins: [],
  }, 'https://unique-play.com/league/57', [
    { name: '@accessToken', value: 'token' },
    { name: '@userInfo', value: '{"id":1}' },
    { name: 'google_adsense_settings', value: 'discarded' },
  ]);

  assert.deepEqual(state.cookies.map(({ domain, name }) => ({ domain, name })), [
    { domain: '.unique-play.com', name: 'up-cookie' },
  ]);
  assert.deepEqual(state.origins, [{
    origin: 'https://unique-play.com',
    localStorage: [
      { name: '@accessToken', value: 'token' },
      { name: '@userInfo', value: '{"id":1}' },
    ],
  }]);
});
