import type { PlayEvent } from '../state/demoStore';
import { normalizeCompositePlay, type CompositeRecord } from './compositePlayEngine.ts';
import { createScoringEventLookup } from './scoringEventFacts.ts';

export type DefensiveSide = 'home' | 'away';
export type DefensiveSlot = { name: string; number: string; pos: string };
export type DefensiveSnapshot = {
  version: 1;
  matchId: string;
  playId: string;
  inning: number;
  half: 'top' | 'bottom';
  side: DefensiveSide;
  rosterKey: string;
  lineup: DefensiveSlot[];
};
type DefensiveState = {
  activeMatchId: string | null;
  inning: number;
  half: 'top' | 'bottom';
  lineups: { home: DefensiveSlot[]; away: DefensiveSlot[] };
  events: PlayEvent[];
};
export const DEFENSIVE_STATS = ['putouts', 'assists', 'errors', 'pb', 'dp', 'tp'] as const;
export type DefensiveStats = Record<(typeof DEFENSIVE_STATS)[number], number>;
export type DefensivePlayer = { key: string; name: string; number: string; side: DefensiveSide };
export type DefensiveCredit = {
  eventId: string; playId: string; position: string; side: DefensiveSide;
  stats: DefensiveStats; player?: DefensivePlayer; reason?: string; multiOutUnconfirmed: boolean;
};
export type DefensiveIssue = { eventId: string; code: string; message: string; position?: string };
export type DefensivePlayerRow = DefensivePlayer & {
  stats: DefensiveStats; positions: string[]; eventIds: string[]; unconfirmedMultiOut: number;
};
export type DefensiveLedger = {
  players: DefensivePlayerRow[]; credits: DefensiveCredit[]; issues: DefensiveIssue[];
  totals: DefensiveStats; assigned: DefensiveStats; unassigned: DefensiveStats;
  compositeEvents: number; attributedEvents: number;
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim()) && value.length <= 200;
const emptyStats = (): DefensiveStats => ({ putouts: 0, assists: 0, errors: 0, pb: 0, dp: 0, tp: 0 });
const add = (target: DefensiveStats, source: DefensiveStats) => DEFENSIVE_STATS.forEach(key => { target[key] += source[key]; });
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => object(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const sourcePriority = (event: PlayEvent) => event.source?.kind === 'manual' ? 3 : event.source?.kind === 'text_feed_rebuild' ? 1 : 2;
const playIdentity = (event: PlayEvent) => event.compositePlay?.input?.id ?? event.defensiveSnapshot?.playId;
const eventIdentity = (event: PlayEvent) => event.eventId
  ? JSON.stringify([event.inning, event.half, event.eventId])
  : JSON.stringify([event.inning, event.half, event.order ?? 0, event.pitch ?? 0, event.batter ?? '']);
const scoringIdentity = (event: PlayEvent) => stable([event.compositePlay, event.defensiveSnapshot, event.manualResolve]);

export function defensivePosition(value: string): string | undefined {
  const token = value.trim().toUpperCase().replace(/\s+/g, '');
  const positions: Record<string, string> = {
    P: '1', 투수: '1', C: '2', 포수: '2', '1B': '3', '1루수': '3',
    '2B': '4', '2루수': '4', '3B': '5', '3루수': '5', SS: '6', 유격수: '6',
    LF: '7', 좌익수: '7', CF: '8', 중견수: '8', RF: '9', 우익수: '9',
  };
  return /^[1-9]$/.test(token) ? token : positions[token];
}

// Only the successful live composite action calls this adapter. Hydration, text
// reconstruction, official imports and undo/redo never backfill historical rosters.
export function attachCompositeDefensiveSnapshots<T extends DefensiveState>(before: T, after: T, playId: string): T {
  if (before === after || before.events.some(event => event.compositePlay?.input.id === playId)) return after;
  let changed = false;
  const events = after.events.map(event => {
    const record = event.compositePlay;
    if (!record || record.input.id !== playId || event.defensiveSnapshot) return event;
    const expected = record.input.expected;
    if (!before.activeMatchId || expected.activeMatchId !== before.activeMatchId ||
        expected.inning !== before.inning || expected.half !== before.half) return event;
    const side: DefensiveSide = expected.half === 'top' ? 'home' : 'away';
    const snapshot: DefensiveSnapshot = {
      version: 1, matchId: before.activeMatchId, playId, inning: expected.inning,
      half: expected.half, side, rosterKey: expected.rosterKey,
      lineup: before.lineups[side].map(player => ({ name: player.name, number: player.number, pos: player.pos })),
    };
    changed = true;
    return { ...event, defensiveSnapshot: snapshot };
  });
  return changed ? { ...after, events } : after;
}

export function defensiveSnapshotIssue(raw: unknown, record: CompositeRecord, event: Pick<PlayEvent, 'inning' | 'half'>): string | undefined {
  if (!object(raw)) return '사건 당시 수비 라인업이 없어 선수 귀속을 확정할 수 없습니다.';
  const expected = record.input.expected;
  const side = expected.half === 'top' ? 'home' : 'away';
  if (raw.version !== 1 || raw.matchId !== expected.activeMatchId || raw.playId !== record.input.id ||
      raw.inning !== expected.inning || raw.half !== expected.half || raw.side !== side ||
      raw.rosterKey !== expected.rosterKey || event.inning !== expected.inning || event.half !== expected.half) {
    return '수비 라인업의 경기·사건·공수·라인업 버전이 원본 사건과 일치하지 않습니다.';
  }
  if (!Array.isArray(raw.lineup) || raw.lineup.length > 64 || raw.lineup.some(player => !object(player) ||
      ['name', 'number', 'pos'].some(key => typeof player[key] !== 'string' || (player[key] as string).length > 200))) {
    return '수비 라인업 데이터 형식이 올바르지 않습니다.';
  }
  return undefined;
}

export function resolveDefender(snapshot: DefensiveSnapshot, position: string): { player?: DefensivePlayer; reason?: string } {
  const candidates = snapshot.lineup.filter(slot => defensivePosition(slot.pos) === position);
  if (candidates.length !== 1) return { reason: candidates.length ? '같은 수비 위치에 선수가 둘 이상입니다.' : '해당 수비 위치의 선수가 없습니다.' };
  const slot = candidates[0];
  if (!text(slot.name) || !text(slot.number)) return { reason: '선수 이름 또는 등번호가 없어 동일 선수 여부를 확정할 수 없습니다.' };
  const name = slot.name.trim(), number = slot.number.trim();
  const duplicates = snapshot.lineup.filter(other => defensivePosition(other.pos) && other.name.trim() === name && other.number.trim() === number);
  if (duplicates.length !== 1) return { reason: '동일 선수 식별 정보가 여러 수비 위치에 중복되어 있습니다.' };
  return { player: { key: JSON.stringify([snapshot.matchId, snapshot.side, name, number]), name, number, side: snapshot.side } };
}

// This projection expects a canonical record. The public ledger validates it first.
export function projectDefensiveCredits(record: CompositeRecord, event: PlayEvent): DefensiveCredit[] {
  const snapshot = event.defensiveSnapshot;
  const snapshotIssue = defensiveSnapshotIssue(snapshot, record, event);
  const eventId = event.eventId ?? record.input.id;
  const side: DefensiveSide = record.input.expected.half === 'top' ? 'home' : 'away';
  return Object.entries(record.fielding).flatMap(([position, values]) => {
    const stats = emptyStats();
    DEFENSIVE_STATS.forEach(key => { stats[key] = values[key] ?? 0; });
    if (!DEFENSIVE_STATS.some(key => stats[key] > 0)) return [];
    const attribution = snapshotIssue || !snapshot ? { reason: snapshotIssue } : resolveDefender(snapshot, position);
    return [{ eventId, playId: record.input.id, position, side, stats, ...attribution,
      multiOutUnconfirmed: record.outsAdded >= 2 && !record.input.multiOut }];
  });
}

export function buildDefensiveFieldingLedger(events: PlayEvent[], matchId: string | null | undefined): DefensiveLedger {
  const ledger: DefensiveLedger = { players: [], credits: [], issues: [], totals: emptyStats(), assigned: emptyStats(), unassigned: emptyStats(), compositeEvents: 0, attributedEvents: 0 };
  if (!matchId) return ledger;
  const relevant = events.filter(event => {
    const eventMatchId = event.compositePlay?.input?.expected?.activeMatchId ?? event.defensiveSnapshot?.matchId;
    return (event.type === 'composite' || event.compositePlay) && (!eventMatchId || eventMatchId === matchId);
  });
  const lookup = createScoringEventLookup(relevant);
  // Resolve authority before validation: an unresolved/invalid official manual
  // correction must not make a lower-priority live copy authoritative again.
  const groups = new Map<string, PlayEvent[]>();
  for (const event of lookup.values()) {
    const id = playIdentity(event) ?? `event:${eventIdentity(event)}`;
    const group = groups.get(id) ?? [];
    group.push(event); groups.set(id, group);
  }
  const players = new Map<string, DefensivePlayerRow>();
  for (const group of groups.values()) {
    const event = group.reduce((best, candidate) => sourcePriority(candidate) > sourcePriority(best) ? candidate : best);
    const eventId = event.eventId ?? event.compositePlay?.input?.id ?? 'unknown';
    const competing = relevant.filter(other => sourcePriority(other) === sourcePriority(event) &&
      (eventIdentity(other) === eventIdentity(event) || (playIdentity(event) && playIdentity(other) === playIdentity(event))));
    if (competing.some(other => scoringIdentity(other) !== scoringIdentity(event))) {
      ledger.issues.push({ eventId, code: 'conflicting_source', message: '동일 우선순위의 사건 또는 수비 라인업이 충돌합니다.' });
      continue;
    }
    if (event.manualResolve?.required) {
      ledger.issues.push({ eventId, code: 'manual_resolve', message: '수동 확정 전인 사건은 선수별 수비 기록에서 제외합니다.' });
      continue;
    }
    const record = normalizeCompositePlay(event.compositePlay);
    if (!record) {
      ledger.issues.push({ eventId, code: 'invalid_composite', message: '재계산 검증을 통과하지 못한 복합 사건입니다.' });
      continue;
    }
    ledger.compositeEvents += 1;
    const credits = projectDefensiveCredits(record, event);
    if (credits.length && credits.every(credit => credit.player)) ledger.attributedEvents += 1;
    for (const credit of credits) {
      ledger.credits.push(credit); add(ledger.totals, credit.stats);
      if (!credit.player) {
        add(ledger.unassigned, credit.stats);
        ledger.issues.push({ eventId: credit.eventId, code: 'unassigned_defender', position: credit.position, message: credit.reason ?? '수비 선수 미확정' });
        continue;
      }
      add(ledger.assigned, credit.stats);
      let row = players.get(credit.player.key);
      if (!row) {
        row = { ...credit.player, stats: emptyStats(), positions: [], eventIds: [], unconfirmedMultiOut: 0 };
        players.set(row.key, row);
      }
      add(row.stats, credit.stats);
      if (!row.positions.includes(credit.position)) row.positions.push(credit.position);
      if (!row.eventIds.includes(credit.eventId)) row.eventIds.push(credit.eventId);
      if (credit.multiOutUnconfirmed) row.unconfirmedMultiOut += 1;
    }
  }
  ledger.players = [...players.values()].sort((a, b) => a.side.localeCompare(b.side) || a.name.localeCompare(b.name) || a.number.localeCompare(b.number));
  return ledger;
}
