import type { PlayEvent } from '../state/demoStore';
import { compositePlayValidationIssues } from './compositePlayEngine.ts';
import { createScoringEventLookup } from './scoringEventFacts.ts';

export type ScoringIntegrityIssue = {
  eventId: string;
  inning?: number;
  half?: 'top' | 'bottom';
  reasons: string[];
  original: unknown;
};
const object = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const key = (e: PlayEvent) => JSON.stringify([e.inning, e.half, e.eventId || [e.order, e.pitch, e.batter]]);
const priority = (e: PlayEvent) => e.source?.kind === 'manual' ? 3 : e.source?.kind === 'text_feed_rebuild' ? 1 : 2;
const signature = (e: PlayEvent) => {
  try { return JSON.stringify([e.type, e.compositePlay, e.manualResolve]); }
  catch { return null; }
};

/** Uses the aggregation source precedence; diagnostics never mutate or persist events. */
export function inspectScoringIntegrity(events: readonly PlayEvent[]) {
  const issues: ScoringIntegrityIssue[] = [];
  if (!Array.isArray(events)) return { status: 'review_required' as const, issues: [{ eventId: 'collection', reasons: ['사건 목록을 읽을 수 없습니다.'], original: events }] };
  const valid = events.filter((e, n) => {
    if (object(e)) return true;
    issues.push({ eventId: 'invalid-' + n, reasons: ['사건 원본 형식이 손상되었습니다.'], original: e });
    return false;
  });
  const buckets = new Map<string, PlayEvent[]>();
  for (const e of valid) { const id = key(e); buckets.set(id, [...(buckets.get(id) ?? []), e]); }
  for (const e of createScoringEventLookup(valid).values()) {
    if (!e.compositePlay && e.type !== 'composite' && !e.manualResolve?.required) continue;
    const reasons = e.compositePlay || e.type === 'composite' ? compositePlayValidationIssues(e.compositePlay) : [];
    if (e.manualResolve?.required) reasons.push('수동 확정이 필요한 사건입니다.', ...(Array.isArray(e.manualResolve.reasons) ? e.manualResolve.reasons.filter(r => typeof r === 'string') : []));
    const peers = (buckets.get(key(e)) ?? []).filter(peer => priority(peer) === priority(e));
    if (peers.some(peer => signature(peer) === null) || new Set(peers.map(signature)).size > 1)
      reasons.push('동일 사건 ID와 우선순위에 서로 다른 원본이 있습니다. 어느 기록을 채택할지 재심이 필요합니다.');
    if (reasons.length) issues.push({ eventId: e.eventId || 'legacy-' + key(e), inning: e.inning, half: e.half,
      reasons: [...new Set(reasons)], original: peers.length > 1 ? peers : e });
  }
  return { status: issues.length ? 'review_required' as const : 'validated' as const, issues };
}
