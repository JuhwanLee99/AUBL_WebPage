// scripts/set-admin-claim.js
// 관리자 설정용 스크립트

import { createRequire } from 'module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const require = createRequire(import.meta.url);
const sa = require('../serviceAccountKey.json');

// ⬇ 여기에 실제 UID 입력
const TARGET_UID = '73gidKdTH4XV2MaVmRWJwFFDYCA3';

initializeApp({ credential: cert(sa) });

async function main() {
  await getAuth().setCustomUserClaims(TARGET_UID, { admin: true });
  console.log(`admin=true set for UID: ${TARGET_UID}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
