// scripts/seed-single-match.js
// 단일 경기(박스스코어 포함) 업로드 스크립트

import { createRequire } from 'module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Node 22에서 JSON import assert가 프로젝트 설정에 따라 막힐 수 있어 require로 읽습니다.
const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

// ---------- 여기를 경기별로 수정 ----------
const matchId = '20260125-falcons-eagles';

// 경기 기본 정보 + 박스스코어 (투수/타자 세부 기록 포함)
const matchData = {
  homeTeamId: 'seoulcity-falcons',
  homeTeamName: '서울시립대학교 FALCONS',
  awayTeamId: 'yonsei-eagles',
  awayTeamName: '연세대학교 EAGLES',
  startTime: '2026-01-25T04:30:00Z', // 13:30 KST → 04:30 UTC
  venue: '유신고등학교 야구장',
  status: 'completed',
  homeScore: 5,
  awayScore: 4,

  // 라인업 (투수도 타선에 포함될 수 있으니 P/DH를 그대로 둡니다)
  lineups: {
    home: [
      { name: '전건희', pos: 'CF', number: '8', throws: 'R', bats: 'R', order: 1 },
      { name: '강다현', pos: 'P',  number: '7', throws: 'R', bats: 'R', order: 2 },
      { name: '신민환', pos: 'RF', number: '14', throws: 'R', bats: 'R', order: 3 },
      { name: '이찬일', pos: 'C',  number: '27', throws: 'R', bats: 'R', order: 4 },
      { name: '송수혁', pos: 'LF', number: '17', throws: 'R', bats: 'R', order: 5 },
      { name: '김상준', pos: '3B', number: '1',  throws: 'R', bats: 'R', order: 6 },
      { name: '노지훈', pos: '1B', number: '26', throws: 'R', bats: 'R', order: 7 },
      { name: '최인우', pos: 'LF', number: '16', throws: 'R', bats: 'R', order: 8 },
      { name: '송준호', pos: 'RF', number: '13', throws: 'R', bats: 'R', order: 9 },
    ],
    away: [
      { name: '김민재', pos: 'CF', number: '36', throws: 'R', bats: 'R', order: 1 },
      { name: '김동혁', pos: 'RF', number: '0',  throws: 'R', bats: 'R', order: 2 },
      { name: '장주희', pos: 'LF', number: '52', throws: 'R', bats: 'R', order: 3 },
      { name: '조윤민', pos: 'SS', number: '7',  throws: 'R', bats: 'R', order: 4 },
      { name: '장동훈', pos: 'C',  number: '1',  throws: 'R', bats: 'R', order: 5 },
      { name: '정연우', pos: 'P',  number: '18', throws: 'R', bats: 'R', order: 6 },
      { name: '나탄',   pos: '1B', number: '0',  throws: 'R', bats: 'R', order: 7 },
      { name: '문경호', pos: 'C',  number: '2',  throws: 'R', bats: 'R', order: 8 },
      { name: '강빈A', pos: 'DH', number: '32', throws: 'R', bats: 'R', order: 9 },
    ],
  },
  benches: {
    home: [],
    away: [
      { name: '백건우', pos: 'PR', number: '54', throws: 'R', bats: 'R' },
      { name: '강의연', pos: 'PH', number: '0',  throws: 'R', bats: 'R' },
      { name: '성치훈', pos: 'PH', number: '0',  throws: 'R', bats: 'R' },
    ],
  },

  // 경기 종료 후 박스스코어
  postGame: {
    note: '2026-01-25 GameOne 박스스코어 (서울시립대 5-4 연세대)',
    lineScore: {
      innings: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      home: [2, 0, 0, 0, 2, 0, 0, 1, ],
      away: [1, 0, 0, 1, 0, 0, 2, 0, ],
    },
    totals: {
      home: { runs: 5, hits: 7, errors: 3, lob: 4 },
      away: { runs: 4, hits: 3, errors: 2, lob: 2 },
    },
    teamBatterSummary: {
      home: { ab: 31, h: 7, r: 5, rbi: 3, sb: 6 },
      away: { ab: 28, h: 3, r: 4, rbi: 4, sb: 2 },
    },
    pitchers: {
      home: [
        { name: '강다현', result: '승', ip: 7, bf: 28, ab: 26, h: 3, hr: 1, bb: 0, hbp: 0, so: 4, r: 4, er: 1, pitches: 99 },
        { name: '이찬일', result: '세', ip: 1, bf: 4, ab: 2, h: 0, hr: 0, bb: 0, hbp: 0, so: 2, r: 0, er: 0, pitches: 10 },
      ],
      away: [
        { name: '권은성', ip: 4.1, bf: 21, ab: 18, h: 5, hr: 0, bb: 1, hbp: 1, so: 7, r: 4, er: 3, pitches: 89, wp: 1 },
        { name: '정연우', ip: 3.2, bf: 16, ab: 13, h: 2, hr: 1, bb: 1, hbp: 1, so: 8, r: 1, er: 0, pitches: 80, wp: 1 },
      ],
    },
    // 타자별 세부 기록 (DH 없이 투수가 타석에 선 경우 그대로 포함)
    batters: {
      home: [
        { name: '전건희', pos: 'CF', order: 1, ab: 5, h: 1, rbi: 0, r: 1, sb: 0, avg: 0.2, seasonAvg: 0.154 },
        { name: '강다현', pos: 'P',  order: 2, ab: 4, h: 1, rbi: 1, r: 1, sb: 2, avg: 0.25, seasonAvg: 0.526 },
        { name: '신민환', pos: 'RF', order: 3, ab: 3, h: 1, rbi: 0, r: 0, sb: 0, avg: 0.333, seasonAvg: 0.316 },
        { name: '이찬일', pos: 'C',  order: 4, ab: 5, h: 1, rbi: 0, r: 0, sb: 0, avg: 0.2, seasonAvg: 0.571 },
        { name: '송수혁', pos: 'LF', order: 5, ab: 2, h: 1, rbi: 0, r: 1, sb: 2, avg: 0.5, seasonAvg: 0.45 },
        { name: '김상준', pos: '3B', order: 6, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.267 },
        { name: '노지훈', pos: '1B', order: 7, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.211 },
        { name: '최인우', pos: 'LF', order: 8, ab: 3, h: 2, rbi: 1, r: 2, sb: 2, avg: 0.667, seasonAvg: 0.0 },
        { name: '송준호', pos: 'RF', order: 9, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.318 },
      ],
      away: [
        { name: '김민재', pos: 'CF', order: 1, ab: 4, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.593 },
        { name: '김동혁', pos: 'RF', order: 2, ab: 4, h: 1, rbi: 0, r: 1, sb: 0, avg: 0.25, seasonAvg: 0.286 },
        { name: '장주희', pos: 'LF', order: 3, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.5 },
        { name: '조윤민', pos: 'SS', order: 4, ab: 3, h: 1, rbi: 2, r: 1, sb: 1, avg: 0.333, seasonAvg: 0.467 },
        { name: '장동훈', pos: 'C',  order: 5, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.222 },
        { name: '정연우', pos: 'P',  order: 6, ab: 2, h: 0, rbi: 0, r: 1, sb: 1, avg: 0.0, seasonAvg: 0.5 },
        { name: '나탄',   pos: '1B', order: 7, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.154 },
        { name: '문경호', pos: 'C',  order: 8, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.2 },
        { name: '강빈A', pos: 'DH', order: 9, ab: 1, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.125 },
        { name: '백건우', pos: 'PR', slot: '대주자', ab: 0, h: 0, rbi: 0, r: 0, sb: 0 },
        { name: '강의연', pos: 'PH', slot: '대타', ab: 1, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.375 },
        { name: '성치훈', pos: 'PH', slot: '대타/승부주자', ab: 1, h: 1, rbi: 2, r: 1, sb: 0, avg: 1.0, seasonAvg: 0.083 },
      ],
    },
  },
};
// -----------------------------------------

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const ref = db.collection('matches').doc(matchId);

  // 기존 문서 전체 삭제 후 새로 업로드 (남은 필드는 모두 정리)
  await ref.delete();
  console.log(`matches/${matchId} deleted`);

  await ref.set(matchData, { merge: false });
  console.log(`matches/${matchId} recreated with box score`);

  // // 이 경기를 바로 방송 대상으로 지정하려면 주석을 풀어 사용하세요.
  // await db.collection('app').doc('current').set({ activeMatchId: matchId, updatedAt: Date.now() }, { merge: true });
}

main()
  .then(() => process.exit())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
