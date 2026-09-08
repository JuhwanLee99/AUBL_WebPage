import { resolveCompositePlay } from '../../../src/shared/lib/compositePlayEngine.ts';
import { attachCompositeDefensiveSnapshots } from '../../../src/shared/lib/defensiveFielding.ts';
import { fieldingInput, fieldingLineup, fieldingUnitContext } from '../scoring/defensive-fixtures.mjs';

export function archiveReviewEvent(matchId, kind = 'missing') {
  const context = { ...structuredClone(fieldingUnitContext), activeMatchId: matchId };
  const id = `LOCAL_ARCHIVE_PLAY_${kind.toUpperCase()}`;
  const result = resolveCompositePlay(context, fieldingInput(context, id));
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  const before = { ...context, lineups: { home: fieldingLineup(), away: fieldingLineup('AWAY') }, events: [] };
  const bare = { inning: context.inning, half: context.half, order: 1, batter: context.batterId, pitch: 1,
    type: 'composite', runners: [], eventId: `LOCAL_ARCHIVE_${kind.toUpperCase()}`, source: { kind: 'live' }, compositePlay: result.record };
  const event = attachCompositeDefensiveSnapshots(before, { ...before, events: [bare] }, id).events[0];
  if (kind === 'missing') event.defensiveSnapshot.lineup[5].number = '';
  if (kind === 'broken') event.compositePlay.runs = 99;
  if (kind === 'pending') event.manualResolve = { required: true, reasons: ['LOCAL REVIEW PENDING'] };
  return event;
}
