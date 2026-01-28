// scripts/seed-single-match-lions-kings.js
// 단일 경기(박스스코어 포함) 업로드 스크립트

import { createRequire } from 'module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Node 22에서 JSON import assert가 프로젝트 설정에 따라 막힐 수 있어 require로 읽습니다.
const require = createRequire(import.meta.url);
const serviceAccount = require('../serviceAccountKey.json');

// ---------- 여기를 경기별로 수정 ----------
const matchId = '20260125-lions-kings';

// 경기 기본 정보 + 박스스코어 (투수/타자 세부 기록 포함)
const matchData = {
  homeTeamId: 'sejong-kings',
  homeTeamName: '세종대학교 세종킹스',
  awayTeamId: 'kyunghee-intl-lions',
  awayTeamName: '경희대국제 LIONS',
  startTime: '2026-01-25T01:00:00Z', // 10:00 KST → 01:00 UTC
  venue: '유신고등학교 야구장',
  status: 'completed',
  homeScore: 5,
  awayScore: 0,

  // 라인업 (DH 포함)
  lineups: {
    home: [
      { name: '김세윤', pos: 'C', number: '18', throws: 'R', bats: 'R', order: 1 },
      { name: '김성윤', pos: 'LF', number: '21', throws: 'R', bats: 'R', order: 2 },
      { name: '이태형', pos: 'CF', number: '99', throws: 'R', bats: 'R', order: 3 },
      { name: '김진규', pos: '3B', number: '76', throws: 'R', bats: 'R', order: 4 },
      { name: '김경록', pos: '1B', number: '4', throws: 'R', bats: 'R', order: 5 },
      { name: '이현채', pos: 'DH', number: '61', throws: 'R', bats: 'R', order: 6 },
      { name: '정동주', pos: 'RF', number: '45', throws: 'R', bats: 'R', order: 7 },
      { name: '김윤하', pos: 'SS', number: '75', throws: 'R', bats: 'R', order: 8 },
      { name: '이중학', pos: '2B', number: '78', throws: 'R', bats: 'R', order: 9 },
    ],
    away: [
      { name: '천성훈', pos: 'SS', number: '7', throws: 'R', bats: 'R', order: 1 },
      { name: '홍순욱', pos: 'LF', number: '35', throws: 'R', bats: 'R', order: 2 },
      { name: '임우진', pos: 'CF', number: '53', throws: 'R', bats: 'R', order: 3 },
      { name: '정종호', pos: '3B', number: '0', throws: 'R', bats: 'R', order: 4 },
      { name: '심영재', pos: '1B', number: '47', throws: 'R', bats: 'R', order: 5 },
      { name: '박지현', pos: 'RF', number: '52', throws: 'R', bats: 'R', order: 6 },
      { name: '김수홍', pos: 'C', number: '62', throws: 'R', bats: 'R', order: 7 },
      { name: '차성준', pos: 'DH', number: '60', throws: 'R', bats: 'R', order: 8 },
      { name: '이준석', pos: '2B', number: '89', throws: 'R', bats: 'R', order: 9 },
    ],
  },
  benches: {
    home: [
      { name: '이승현', pos: 'PR', number: '2', throws: 'R', bats: 'R' }, // 대주자 투입
      { name: '이승원', pos: 'OF', number: '26', throws: 'R', bats: 'R' },
    ],
    away: [
      { name: '이동혁', pos: 'CF', number: '27', throws: 'R', bats: 'R' }, // 대수비
      { name: '유현수', pos: 'P', number: '24', throws: 'R', bats: 'R' },
      { name: '혜예준', pos: 'P', number: '0', throws: 'R', bats: 'R' },
    ],
  },

  // 경기 종료 후 박스스코어
  postGame: {
    note: '2026-01-25 GameOne 박스스코어 (세종대 5-0 경희대국제)',
    lineScore: {
      innings: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      // 진행하지 않은 이닝은 빈 문자열로 남겨 두었습니다.
      home: [0, 1, 3, 0, 0, 1, 0, '', ''],
      away: [0, 0, 0, 0, 0, 0, '', '', ''],
    },
    totals: {
      home: { runs: 5, hits: 8, errors: 0 },
      away: { runs: 0, hits: 5, errors: 2 },
    },
    teamBatterSummary: {
      home: { ab: 28, h: 8, r: 5, rbi: 4, sb: 5 },
      away: { ab: 25, h: 5, r: 0, rbi: 0, sb: 0 },
    },
    pitchers: {
      home: [
        { name: '지건혁', result: '승', ip: 3.2, bf: 19, ab: 15, h: 5, hr: 0, bb: 3, hbp: 1, so: 3, r: 0, er: 0, pitches: 71, wp: 2 },
        { name: '이태형', result: '세', ip: 3.1, bf: 11, ab: 10, h: 0, hr: 0, bb: 0, hbp: 0, so: 6, r: 0, er: 0, pitches: 50 },
      ],
      away: [
        { name: '유현수', result: '패', ip: 5, bf: 29, ab: 25, h: 8, hr: 0, bb: 3, hbp: 1, so: 2, r: 5, er: 3, pitches: 71 },
        { name: '혜예준', ip: 1, bf: 6, ab: 3, h: 0, hr: 0, bb: 3, hbp: 0, so: 1, r: 0, er: 0, pitches: 28, wp: 1 },
      ],
    },
    // 타자별 세부 기록 (교체 포함)
    batters: {
      home: [
        { name: '김세윤', pos: 'C', order: 1, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.375 },
        { name: '김성윤', pos: 'LF', order: 2, ab: 3, h: 0, rbi: 1, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.529 },
        { name: '이태형', pos: 'CF', order: 3, ab: 2, h: 1, rbi: 0, r: 1, sb: 3, avg: 0.5, seasonAvg: 0.462 },
        { name: '김진규', pos: '3B', order: 4, ab: 3, h: 1, rbi: 0, r: 1, sb: 1, avg: 0.333, seasonAvg: 0.286 },
        { name: '김경록', pos: '1B', order: 5, ab: 4, h: 1, rbi: 1, r: 1, sb: 0, avg: 0.25, seasonAvg: 0.167 },
        { name: '이현채', pos: 'DH', order: 6, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.588 },
        { name: '정동주', pos: 'RF', order: 7, ab: 3, h: 2, rbi: 1, r: 1, sb: 0, avg: 0.667, seasonAvg: 0.286 },
        { name: '김윤하', pos: 'SS', order: 8, ab: 3, h: 2, rbi: 1, r: 1, sb: 1, avg: 0.667, seasonAvg: 0.467 },
        { name: '이중학', pos: '2B', order: 9, ab: 4, h: 1, rbi: 0, r: 0, sb: 0, avg: 0.25, seasonAvg: 0.2 },
        { name: '이승현', pos: 'PR', slot: '대주자', ab: 0, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.333 },
      ],
      away: [
        { name: '천성훈', pos: 'SS', order: 1, ab: 2, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.333 },
        { name: '홍순욱', pos: 'LF', order: 2, ab: 3, h: 2, rbi: 0, r: 0, sb: 0, avg: 0.667, seasonAvg: 0.5 },
        { name: '임우진', pos: 'CF', order: 3, ab: 1, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.417 },
        { name: '정종호', pos: '3B', order: 4, ab: 4, h: 1, rbi: 0, r: 0, sb: 0, avg: 0.25, seasonAvg: 0.444 },
        { name: '심영재', pos: '1B', order: 5, ab: 1, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.4 },
        { name: '박지현', pos: 'RF', order: 6, ab: 3, h: 1, rbi: 0, r: 0, sb: 0, avg: 0.333, seasonAvg: 0.455 },
        { name: '김수홍', pos: 'C', order: 7, ab: 3, h: 1, rbi: 0, r: 0, sb: 0, avg: 0.333, seasonAvg: 0.235 },
        { name: '차성준', pos: 'DH', order: 8, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.211 },
        { name: '이준석', pos: '2B', order: 9, ab: 3, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.333 },
        { name: '이동혁', pos: 'CF', slot: '대수비', ab: 2, h: 0, rbi: 0, r: 0, sb: 0, avg: 0.0, seasonAvg: 0.667 },
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
