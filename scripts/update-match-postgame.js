import { createRequire } from 'module';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
const require = createRequire(import.meta.url);
const sa = require('../serviceAccountKey.json');

const matchId = '20250125-falcons-eagles';

const postGame = {
  lineScore: { innings: [1,2,3,4,5,6,7,8,9], home: [2,0,0,0,0,0,0,1,2], away: [1,0,0,1,0,0,2,0,0] },
  totals: { home: { runs: 5, hits: 7, errors: 3, lob: 4 }, away: { runs: 4, hits: 3, errors: 2, lob: 2 } },
  teamBatterSummary: { home: { ab: 31, h: 7, r: 5, rbi: 3, sb: 6 }, away: { ab: 28, h: 3, r: 4, rbi: 4, sb: 0 } },
  pitchers: {
    home: [
      { name: '강다현', ip: 7, bf: 28, ab: 26, h: 3, hr: 1, bb: 0, hbp: 0, so: 4, r: 4, er: 4, pitches: 99 },
      { name: '이찬일', ip: 1, bf: 4, ab: 2, h: 0, hr: 0, bb: 0, hbp: 0, so: 2, r: 0, er: 0, pitches: 10 },
    ],
    away: [
      { name: '권은성', ip: 4.1, bf: 21, ab: 18, h: 5, hr: 0, bb: 0, hbp: 0, so: 7, r: 4, er: 3, pitches: 89 },
      { name: '정연우', ip: 3.2, bf: 16, ab: 13, h: 2, hr: 0, bb: 0, hbp: 0, so: 8, r: 1, er: 0, pitches: 80 },
    ],
  },
  note: 'GameOne box score 2025-01-25 서울시립대 5-4 연세대',
};

initializeApp({ credential: cert(sa) });
const db = getFirestore();

await db.collection('matches').doc(matchId).set({ postGame }, { merge: true });
console.log('postGame saved');