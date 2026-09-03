import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptStorageState, encryptStorageState } from '../src/session.mjs';

test('browser storage state is encrypted with authenticated encryption', () => {
  const key = randomBytes(32).toString('base64');
  const state = { cookies: [{ name: 'session', value: 'secret-cookie' }], origins: [] };
  const encrypted = encryptStorageState(state, key);

  assert.equal(encrypted.includes('secret-cookie'), false);
  assert.deepEqual(decryptStorageState(encrypted, key), state);
  assert.throws(() => decryptStorageState(encrypted, randomBytes(32).toString('base64')));
});
