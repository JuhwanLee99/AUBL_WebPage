import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const UNIQUEPLAY_AUTH_STORAGE_KEYS = new Set(['@accessToken', '@userInfo']);

function readKey(keyBase64 = process.env.UNIQUEPLAY_SESSION_KEY_B64) {
  const key = Buffer.from(keyBase64 || '', 'base64');
  if (key.length !== 32) throw new Error('UNIQUEPLAY_SESSION_KEY_B64 must decode to 32 bytes');
  return key;
}

export function encryptStorageState(state, keyBase64) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', readKey(keyBase64), iv);
  const plaintext = Buffer.from(JSON.stringify(state), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from('UP01'), iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptStorageState(payloadBase64, keyBase64) {
  const payload = Buffer.from(payloadBase64, 'base64');
  if (payload.subarray(0, 4).toString('utf8') !== 'UP01') throw new Error('Unsupported session payload');
  const iv = payload.subarray(4, 16);
  const authTag = payload.subarray(16, 32);
  const ciphertext = payload.subarray(32);
  const decipher = createDecipheriv('aes-256-gcm', readKey(keyBase64), iv);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
}

export function createUniquePlayStorageState(state, origin, localStorageItems) {
  const targetOrigin = new URL(origin).origin;
  if (new URL(targetOrigin).hostname !== 'unique-play.com') {
    throw new Error('UniquePlay storage origin is invalid');
  }

  const authStorage = (localStorageItems || [])
    .filter((item) => UNIQUEPLAY_AUTH_STORAGE_KEYS.has(item?.name) && typeof item?.value === 'string')
    .map(({ name, value }) => ({ name, value }));
  if (!authStorage.some((item) => item.name === '@accessToken' && item.value.trim())) {
    throw Object.assign(new Error('UniquePlay access token was not found in local storage'), { code: 'REAUTH_REQUIRED' });
  }

  const existingOrigin = (state?.origins || []).find((item) => item.origin === targetOrigin);
  const originState = { origin: targetOrigin, localStorage: authStorage };
  if (existingOrigin?.indexedDB) originState.indexedDB = existingOrigin.indexedDB;

  return {
    cookies: (state?.cookies || []).filter((cookie) => {
      const domain = String(cookie?.domain || '').replace(/^\./u, '').toLowerCase();
      return domain === 'unique-play.com' || domain.endsWith('.unique-play.com');
    }),
    origins: [originState],
  };
}

export async function loadStorageState() {
  const inline = process.env.UNIQUEPLAY_SESSION_B64;
  const encrypted = inline || (process.env.UNIQUEPLAY_SESSION_PATH ? await readFile(process.env.UNIQUEPLAY_SESSION_PATH, 'utf8') : '');
  if (!encrypted.trim()) throw Object.assign(new Error('UniquePlay session is not configured'), { code: 'REAUTH_REQUIRED' });
  try {
    return decryptStorageState(encrypted.trim());
  } catch (error) {
    throw Object.assign(new Error('UniquePlay session could not be decrypted'), { code: 'REAUTH_REQUIRED', cause: error });
  }
}
