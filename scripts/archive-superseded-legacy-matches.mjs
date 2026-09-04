import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APPLY_FLAG = '--apply';
const EXPECTED_COUNT = 34;
const ARCHIVE_BATCH = 'unique-play-2026-initial-projection-20260904';

const compact = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^가-힣a-z0-9]/g, '');

const timestamp = (value) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const unorderedTeamKey = (match) =>
  [compact(match.homeTeamName), compact(match.awayTeamName)].sort().join('|');

const venueKey = (match) =>
  compact(match.venue)
    .replace(/고등학교/g, '고')
    .replace(/야구장/g, '');

const scoreByTeam = (match) =>
  new Map([
    [compact(match.homeTeamName), match.homeScore],
    [compact(match.awayTeamName), match.awayScore],
  ]);

const hasScoreConflict = (legacy, uniquePlay) => {
  if (legacy.status !== 'completed' || uniquePlay.status !== 'completed') return false;
  const legacyScores = scoreByTeam(legacy);
  const uniqueScores = scoreByTeam(uniquePlay);
  return [...legacyScores.entries()].some(([team, score]) => {
    const candidate = uniqueScores.get(team);
    return Number(score) !== Number(candidate);
  });
};

const serviceAccountPath =
  process.env.AUBL_FIREBASE_SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json';
const serviceAccount = JSON.parse(await readFile(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const firestore = getFirestore();
const snapshot = await firestore.collection('matches').get();
const matches = snapshot.docs.map((document) => ({
  docId: document.id,
  ...document.data(),
}));

const active = matches.filter((match) => match.deleted !== true && match.sourceActive !== false);
const uniquePlayMatches = active.filter(
  (match) => String(match.sourceProvider ?? '').toUpperCase() === 'UNIQUE_PLAY',
);
const legacyMatches = active.filter(
  (match) => !match.sourceProvider && !match.sourceGameId && new Date(match.startTime).getFullYear() === 2026,
);

const archiveCandidates = legacyMatches.flatMap((legacy) => {
  const legacyTime = timestamp(legacy.startTime);
  const exactPair = uniquePlayMatches.find(
    (candidate) =>
      timestamp(candidate.startTime) === legacyTime &&
      unorderedTeamKey(candidate) === unorderedTeamKey(legacy),
  );
  const sameSlot =
    exactPair ||
    (legacy.status === 'scheduled'
      ? uniquePlayMatches.find(
          (candidate) =>
            candidate.status === 'completed' &&
            timestamp(candidate.startTime) === legacyTime &&
            venueKey(candidate) === venueKey(legacy),
        )
      : undefined);

  if (!sameSlot) return [];
  const conflictType = exactPair
    ? hasScoreConflict(legacy, sameSlot)
      ? 'SCORE_CONFLICT'
      : legacy.status === 'scheduled'
        ? 'COMPLETED_REPLACES_SCHEDULED'
        : 'DUPLICATE_COMPLETED'
    : 'MATCHUP_CONFLICT';

  return [
    {
      legacy,
      replacement: sameSlot,
      conflictType,
      reviewRequired: conflictType === 'SCORE_CONFLICT' || conflictType === 'MATCHUP_CONFLICT',
    },
  ];
});

archiveCandidates.sort(
  (left, right) => timestamp(left.legacy.startTime) - timestamp(right.legacy.startTime),
);

console.table(
  archiveCandidates.map(({ legacy, replacement, conflictType, reviewRequired }) => ({
    legacyDocId: legacy.docId,
    replacementSourceGameId: replacement.sourceGameId,
    conflictType,
    reviewRequired,
  })),
);

console.log(
  JSON.stringify(
    {
      mode: process.argv.includes(APPLY_FLAG) ? 'apply' : 'dry-run',
      archiveBatch: ARCHIVE_BATCH,
      activeDocuments: active.length,
      uniquePlayDocuments: uniquePlayMatches.length,
      legacyDocuments: legacyMatches.length,
      archiveCandidates: archiveCandidates.length,
      reviewRequired: archiveCandidates.filter((item) => item.reviewRequired).length,
    },
    null,
    2,
  ),
);

if (!process.argv.includes(APPLY_FLAG)) {
  console.log(`Dry run only. Re-run with ${APPLY_FLAG} after reviewing the candidates.`);
  process.exit(0);
}

if (archiveCandidates.length !== EXPECTED_COUNT) {
  throw new Error(
    `Safety check failed: expected ${EXPECTED_COUNT} candidates, found ${archiveCandidates.length}.`,
  );
}

const archivedAt = new Date().toISOString();
const batch = firestore.batch();
for (const { legacy, replacement, conflictType, reviewRequired } of archiveCandidates) {
  batch.update(firestore.collection('matches').doc(legacy.docId), {
    sourceActive: false,
    sourceArchiveBatch: ARCHIVE_BATCH,
    sourceArchiveReason: 'SUPERSEDED_BY_UNIQUE_PLAY',
    sourceArchiveReplacementId: replacement.sourceGameId,
    sourceArchiveConflictType: conflictType,
    sourceArchiveReviewState: reviewRequired ? 'REVIEW_REQUIRED' : 'SUPERSEDED',
    sourceArchivedAt: archivedAt,
  });
}
await batch.commit();

console.log(`Archived ${archiveCandidates.length} legacy documents without deleting them.`);
