// scripts/seed-single-match.js
// 단일 경기 업로드용 스크립트

import { createRequire } from 'module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Node 22에서 JSON import assert가 프로젝트 설정에 따라 막힐 수 있어 require로 읽습니다.
const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

// ---------- 여기를 경기별로 수정 ----------
const matchId = '20250125-falcons-eagles';

const matchData = {
  homeTeamId: 'seoulcity-falcons',          // 내부 ID 없으면 생략 가능
  homeTeamName: '서울시립대학교 FALCONS',
  awayTeamId: 'yonsei-eagles',
  awayTeamName: '연세대학교 EAGLES',
  startTime: '2025-01-25T04:30:00Z',       // 13:30 KST → 04:30 UTC
  venue: '유신고등학교 야구장',
  status: 'completed',                     // scheduled | inProgress | completed
  homeScore: 5,
  awayScore: 4,

  // 선택: 라인업(포지션은 박스스코어 기준 추정, 틀리면 콘솔에서 바로 수정 가능)
  lineups: {
    home: [
      { name: '전건희', pos: 'CF', number: '8', throws: 'R', bats: 'R' },
      { name: '강다현', pos: 'P',  number: '7', throws: 'R', bats: 'R' },
      { name: '신민환', pos: 'RF', number: '14', throws: 'R', bats: 'R' },
      { name: '이찬일', pos: 'C',  number: '27', throws: 'R', bats: 'R' },
      { name: '송수혁', pos: 'LF', number: '17', throws: 'R', bats: 'R' },
      { name: '김상준', pos: '3B', number: '1',  throws: 'R', bats: 'R' },
      { name: '노지훈', pos: '1B', number: '26', throws: 'R', bats: 'R' },
      { name: '최인우', pos: 'LF', number: '16', throws: 'R', bats: 'R' },
      { name: '송준호', pos: 'RF', number: '13', throws: 'R', bats: 'R' },
    ],
    away: [
      { name: '김민재', pos: 'CF', number: '36', throws: 'R', bats: 'R' },
      { name: '김동혁', pos: 'RF', number: '0',  throws: 'R', bats: 'R' },
      { name: '장주희', pos: 'LF', number: '52', throws: 'R', bats: 'R' },
      { name: '조윤민', pos: 'SS', number: '7',  throws: 'R', bats: 'R' },
      { name: '장동훈', pos: 'C',  number: '1',  throws: 'R', bats: 'R' },
      { name: '정연우', pos: 'P',  number: '18', throws: 'R', bats: 'R' },
      { name: '나탄',   pos: '1B', number: '0',  throws: 'R', bats: 'R' },
      { name: '문경호', pos: 'C',  number: '2',  throws: 'R', bats: 'R' },
      { name: '강빈A', pos: 'DH', number: '32', throws: 'R', bats: 'R' },
    ],
  },
  // 선택: 벤치/대타·대수비 인원 (원하면 이어서 추가)
  benches: {
    home: [],
    away: [
      { name: '백건우', pos: 'PH', number: '54', throws: 'R', bats: 'R' },
      { name: '강의연', pos: 'PH', number: '0',  throws: 'R', bats: 'R' },
      { name: '성치훈', pos: 'PR', number: '0',  throws: 'R', bats: 'R' },
    ],
  },
};
// -----------------------------------------

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  await db.collection('matches').doc(matchId).set(matchData, { merge: true });
  console.log(`matches/${matchId} upserted`);

  // 이 경기를 바로 방송 대상으로 지정하려면 주석을 풀어 사용하세요.
  // await db.collection('app').doc('current').set({ activeMatchId: matchId, updatedAt: Date.now() }, { merge: true });
}

main().then(() => process.exit()).catch((e) => { console.error(e); process.exit(1); });
