#!/usr/bin/env node

import { appendFileSync } from 'node:fs';

const configUrl = process.env.FIREBASE_WEB_CONFIG_URL;
const expectedProjectId = process.env.EXPECTED_FIREBASE_PROJECT_ID;
const checkOnly = process.argv.includes('--check-only');

if (!configUrl || !expectedProjectId) {
  throw new Error('FIREBASE_WEB_CONFIG_URL and EXPECTED_FIREBASE_PROJECT_ID are required.');
}
if (!configUrl.startsWith('https://') || !configUrl.endsWith('/__/firebase/init.json')) {
  throw new Error('FIREBASE_WEB_CONFIG_URL must be an HTTPS Firebase init.json endpoint.');
}

const response = await fetch(configUrl, { redirect: 'error' });
if (!response.ok) throw new Error(`Firebase web config request failed with HTTP ${response.status}.`);
const config = await response.json();
if (config.projectId !== expectedProjectId) {
  throw new Error(`Firebase project mismatch: expected ${expectedProjectId}.`);
}

const mappings = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  measurementId: 'VITE_FIREBASE_MEASUREMENT_ID',
};
const lines = [];
for (const [sourceKey, environmentKey] of Object.entries(mappings)) {
  const value = config[sourceKey];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Firebase web config is missing ${sourceKey}.`);
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`Firebase web config contains an invalid ${sourceKey}.`);
  }
  lines.push(`${environmentKey}=${value}`);
}

if (!checkOnly) {
  const githubEnvironment = process.env.GITHUB_ENV;
  if (!githubEnvironment) throw new Error('GITHUB_ENV is required outside --check-only mode.');
  appendFileSync(githubEnvironment, `${lines.join('\n')}\n`, { encoding: 'utf8' });
}

console.log(`Validated Firebase web config for ${expectedProjectId}; exported ${checkOnly ? 0 : lines.length} variables.`);
