import type { PlayEvent, PlayLog } from '../state/demoStore';
import { miscPlayKind } from './scoringInputSafety.ts';
import { normalizeCompositePlay } from './compositePlayEngine.ts';

type Identity = { inning: number; half: 'top' | 'bottom'; eventId?: string; order?: number; pitch?: number; batter?: string };
const legacyKey = (entry: Identity) => JSON.stringify([entry.inning, entry.half, entry.order ?? 0, entry.pitch ?? 0, entry.batter ?? '']);
const key = (entry: Identity) => entry.eventId ? JSON.stringify([entry.inning, entry.half, entry.eventId]) : legacyKey(entry);
const priority = (event: PlayEvent) => event.source?.kind === 'manual' ? 3 : event.source?.kind === 'text_feed_rebuild' ? 1 : 2;

export function createScoringEventLookup(events: PlayEvent[]) {
  const entries = new Map<string, PlayEvent>();
  for (const event of events) {
    const id = key(event), existing = entries.get(id);
    if (!existing || priority(event) > priority(existing)) entries.set(id, event);
  }
  return { get: (entry: Identity) => entries.get(key(entry)), values: () => entries.values() };
}

export function classifyRecordedPlateAppearance(result: string, event?: PlayEvent) {
  // Composite events have numeric projections; never parse their presentation text.
  if (event?.compositePlay || event?.type === 'composite') return null;
  if (event?.manualResolve?.required) return null;
  if (event?.outcome === 'plate_pending') return null;
  if (event?.outcome === 'plate_walk') return 'bb' as const;
  if (event?.outcome === 'plate_out') return 'out' as const;
  if (event?.outcome === 'plate_error') return 'error' as const;
  const detail = event?.error && typeof event.error === 'object' ? event.error : undefined;
  if (detail) {
    if (miscPlayKind(detail.errorType) !== 'error' || detail.advanceResults.batter === 'hold') return null;
    return detail.advanceResults.batter === 'out' ? 'out' as const : 'error' as const;
  }
  if (event && ['wp', 'pb', 'balk'].includes(event.type)) return null;
  const text = result.replace(/\s+/g, '');
  if (text.includes('실책') && miscPlayKind(text) !== 'error') return null;
  if (text.includes('홈런')) return 'hr' as const;
  if (text.includes('3루타')) return 'triple' as const;
  if (text.includes('2루타')) return 'double' as const;
  if (text.includes('1루타')) return 'single' as const;
  if (text.includes('고의') || text.toUpperCase().includes('IB') || text.includes('볼넷')) return 'bb' as const;
  if (text.includes('몸에맞는공')) return 'hbp' as const;
  if (text.includes('타격방해')) return 'ci' as const;
  if (text.includes('야수선택') || text.toUpperCase().includes('F.C')) return 'fc' as const;
  if (text.includes('실책') || /E[1-9]/i.test(text)) return 'error' as const;
  if (text.includes('희생플라이') || text.includes('희생번트')) return 'sac' as const;
  if (text.includes('낫아웃실패')) return 'so' as const;
  if (text.includes('낫아웃')) return 'so_reach' as const;
  if (text.includes('삼진')) return 'so' as const;
  if (text.includes('아웃') && !text.includes('도루')) return 'out' as const;
  return null;
}

export function recordedMiscPitch(event?: PlayEvent) {
  if (!event || !['wp', 'pb', 'balk'].includes(event.type)) return undefined;
  const result = event.error && typeof event.error === 'object' ? event.error.pitchResult : undefined;
  return { pitch: event.type !== 'balk' && Boolean(result), ball: event.type !== 'balk' && result === 'ball', strike: event.type !== 'balk' && result === 'strike' };
}

// Feed rows are presentation. Count a structured event once, not each runner row.
export function scoringTeamTotals(events: PlayEvent[], feed: PlayLog[]) {
  const hits = { home: 0, away: 0 }, errors = { home: 0, away: 0 };
  const lookup = createScoringEventLookup(events);
  const covered = new Set<string>(), coveredLegacy = new Set<string>();
  for (const event of lookup.values()) {
    covered.add(key(event));
    coveredLegacy.add(legacyKey(event));
    if (event.manualResolve?.required) continue;
    const offense = event.half === 'top' ? 'away' : 'home';
    const defense = offense === 'home' ? 'away' : 'home';
    if (event.compositePlay || event.type === 'composite') {
      const composite = normalizeCompositePlay(event.compositePlay);
      if (composite) {
        hits[offense] += Object.values(composite.batters).reduce((sum, row) => sum + (row.h ?? 0), 0);
        errors[defense] += composite.input.errors.length;
      }
      continue;
    }
    if (['hit', 'single', 'double', 'triple', 'hr'].includes(event.type)) hits[offense]++;
    const detail = typeof event.error === 'object' ? event.error : undefined;
    const errorText = detail?.errorType ?? (typeof event.error === 'string' ? event.error : event.notes ?? '');
    if (!['wp', 'pb', 'balk'].includes(event.type) && (event.type === 'error' || event.error) && miscPlayKind(errorText) === 'error') errors[defense]++;
  }
  const fallback = new Map<string, PlayLog[]>();
  for (const entry of feed) {
    if (covered.has(key(entry)) || (!entry.eventId && coveredLegacy.has(legacyKey(entry)))) continue;
    if (/기록 반려|\*기록원\*/.test(entry.result)) continue;
    const bucket = fallback.get(key(entry)) ?? [];
    bucket.push(entry);
    fallback.set(key(entry), bucket);
  }
  for (const rows of fallback.values()) {
    const primary = rows.find((row) => row.order > 0 && row.batter) ?? rows[0];
    const offense = primary.half === 'top' ? 'away' : 'home';
    const text = primary.result;
    if (/1루타|2루타|3루타|홈런/.test(text)) hits[offense]++;
    if (rows.some((row) => /실책|\bE[1-9]\b/i.test(row.result) && miscPlayKind(row.result) === 'error')) errors[offense === 'home' ? 'away' : 'home']++;
  }
  return { hits, errors };
}
