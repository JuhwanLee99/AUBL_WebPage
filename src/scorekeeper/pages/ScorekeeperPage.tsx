import { useEffect, useMemo, useState } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { buildGameRecord, useDemoStore } from '../../shared/state/demoStore';
import type { BattedBallDetails, ErrorDetails, RunnerAdvanceOutcome, RunnerAdvanceSelections } from '../../shared/state/demoStore';
import StatsTable from '../../shared/components/StatsTable';
import RemovedPlayersPanel from '../../shared/components/RemovedPlayersPanel';
import type { BatterStatLine, PitcherStatLine } from '../../shared/types/scoreStats';

type Side = 'home' | 'away';

const mainButtons = [
  { label: '볼', color: '#22c55e', action: 'ball' },
  { label: '스트라이크', color: '#22c55e', action: 'strike' },
  { label: '파울', color: '#facc15', action: 'foul' },
  { label: '타격', color: '#3b82f6', action: 'hitMenu' },
  { label: '삼진', color: '#ef4444', action: 'strikeOut' },
  { label: '실행 취소', color: '#94a3b8', action: 'undo' },
];

const hitResultOptions = [
  { label: '1루타', color: '#3b82f6', value: 'single' as const, helper: '타자·주자 1루' },
  { label: '내야 안타', color: '#3b82f6', value: 'single_infield' as const, helper: '1루타 · 내야' },
  { label: '번트 안타', color: '#3b82f6', value: 'single_bunt' as const, helper: '1루타 · 번트' },
  { label: '2루타', color: '#3b82f6', value: 'double' as const, helper: '타자·주자 2루' },
  { label: '인정 2루타', color: '#3b82f6', value: 'double_ground' as const, helper: '2루타 · 규정' },
  { label: '3루타', color: '#3b82f6', value: 'triple' as const, helper: '타자·주자 3루' },
  { label: '홈런', color: '#f97316', value: 'hr' as const, helper: '전원 득점' },
];

const secondaryButtons = [
  { label: '볼넷', color: '#22c55e', action: 'walk' },
  { label: '사구', color: '#22c55e', action: 'hbp' },
  { label: '희생플라이', color: '#facc15', action: 'sac' },
  { label: '아웃', color: '#ef4444', action: 'outMenu' },
  { label: '카운트 리셋', color: '#94a3b8', action: 'resetCount' },
  { label: '주자 클리어', color: '#94a3b8', action: 'clearBases' },
  { label: '이닝 전환', color: '#94a3b8', action: 'nextHalf' },
];

const outButtons = [
  { label: '땅볼 아웃', action: 'out_ground' },
  { label: '뜬공 아웃', action: 'out_fly' },
  { label: '라인드라이브', action: 'out_line' },
  { label: '병살타(2아웃)', action: 'out_dp2' },
  { label: '삼중살(3아웃)', action: 'out_tp3' },
  { label: '내야 플라이', action: 'out_infield_fly' },
  { label: '외야 플라이', action: 'out_outfield_fly' },
  { label: '기타 아웃', action: 'out_other' },
];

const battedBallTypeOptions = [
  '선택 안 함',
  '강한 땅볼',
  '느린 땅볼',
  '라인드라이브(내야)',
  '라인드라이브(외야)',
  '높은 뜬공',
  '낮은 뜬공',
  '내야 플라이',
  '외야 플라이',
  '번트(희생)',
  '번트(안타)',
  '팝업',
  '기타',
];
const battedBallZoneOptions = ['선택 안 함', '3루선상', '좌전', '좌중간', '중전', '우중간', '우전', '1루선상', '내야'];
const errorTypeOptions = ['포구', '송구', '포구 후 송구', '기타'];
type HitResultAction = (typeof hitResultOptions)[number]['value'];
type HitWizardStep = 'result' | 'type' | 'zone';
type HitWizardState = { step: HitWizardStep; result: HitResultAction | null; type: string; zone: string };
type ActionModalData =
  | { role: 'runner'; name: string; base: 0 | 1 | 2 }
  | { role: 'batter'; name: string; side: Side; lineupIndex: number }
  | { role: 'fielder'; name: string; pos: string };

function downloadCsv(content: string, filenamePrefix: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filenamePrefix}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildDownloadName(prefix: string, endedAt?: string | null) {
  const stamp = (endedAt ? new Date(endedAt) : new Date()).toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}`;
}

function formatDateTimeLabel(value: string | null) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('ko-KR');
  } catch {
    return value;
  }
}

function escapeCsvCell(value: unknown) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatBattedBallDetails(details?: BattedBallDetails | null) {
  if (!details) return '-';
  const parts = [details.type, details.zone].filter((part) => part && part !== '선택 안 함');
  return parts.length ? parts.join(' / ') : '-';
}

function buildBattedBallDetailsFromValues(type: string, zone: string): BattedBallDetails | null {
  if (type === '선택 안 함' && zone === '선택 안 함') return null;
  return { type, zone };
}

function baseLabel(idx: number) {
  return idx === 0 ? '1루' : idx === 1 ? '2루' : idx === 2 ? '3루' : '홈';
}

function formatRunnerOutcomeLabel(outcome: RunnerAdvanceOutcome) {
  if (outcome === 'advance') return '진루';
  if (outcome === 'score') return '득점';
  if (outcome === 'out') return '아웃';
  return '유지';
}

function formatErrorAdvanceResults(error?: ErrorDetails | string | null) {
  if (!error || typeof error === 'string') return '-';
  const parts: string[] = [];
  if (error.advanceResults.batter === 'out') {
    parts.push('타자:아웃');
  } else {
    const batterBase = error.advanceResults.batter;
    parts.push(`타자:${batterBase >= 4 ? '홈(득점)' : `${batterBase}루`}`);
  }
  Object.entries(error.advanceResults.runners).forEach(([base, outcome]) => {
    if (!outcome) return;
    const label = `${baseLabel(Number(base))}:${formatRunnerOutcomeLabel(outcome)}`;
    parts.push(label);
  });
  return parts.length ? parts.join(' / ') : '-';
}

function formatErrorSummary(error?: ErrorDetails | string | null) {
  if (!error) return '-';
  if (typeof error === 'string') return error;
  const context = error.context ? ` · ${error.context}` : '';
  return `${error.errorType} · ${error.fielderPos}${context}`;
}

type ErrorSummaryField = Exclude<keyof ErrorDetails, 'advanceResults'>;

function formatErrorField(error: ErrorDetails | string | null | undefined, field: ErrorSummaryField) {
  if (!error || typeof error === 'string') return '-';
  return error[field] || '-';
}

function normalizeLiveUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.replace('/', '').split(/[?/&#]/)[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host.includes('youtube.com')) {
      const liveId = url.pathname.startsWith('/live/') ? url.pathname.split('/live/')[1]?.split(/[?/&#]/)[0] : null;
      const watchId = url.searchParams.get('v');
      const candidate = liveId || watchId;
      if (candidate) {
        return `https://www.youtube.com/embed/${candidate}`;
      }
    }
  } catch {
    // Fallback to trimmed string below.
  }
  const shortMatch = trimmed.match(/youtu\.be\/([^?&#/]+)/);
  if (shortMatch?.[1]) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }
  return trimmed;
}

function buildCsvRecord(record: ReturnType<typeof buildGameRecord>) {
  const lines: string[] = [];
  const add = (...cells: (string | number | boolean | null | undefined)[]) => {
    lines.push(cells.map((cell) => escapeCsvCell(cell)).join(','));
  };
  const addBlank = () => lines.push('');
  const halfLabel = (half: 'top' | 'bottom') => (half === 'top' ? '초' : '말');

  add('게임 정보');
  add('항목', '값');
  add('홈 팀', record.meta.homeTeamName || record.meta.homeTeamId);
  add('원정 팀', record.meta.awayTeamName || record.meta.awayTeamId);
  add('최종 점수', `${record.meta.homeTeamName} ${record.score.home} - ${record.meta.awayTeamName} ${record.score.away}`);
  add('이닝', `${record.meta.inning}회 ${halfLabel(record.meta.half)}`);
  add('종료 여부', record.meta.gameOver ? '예' : '아니오');
  add('종료 시각', record.meta.endedAt ? formatDateTimeLabel(record.meta.endedAt) : '-');
  add('최종 볼카운트', `B${record.counts.balls} / S${record.counts.strikes} / O${record.counts.outs}`);
  add('주자 상황', record.bases.map((runner, idx) => `${idx + 1}루:${runner ?? '-'}`).join(' | '));

  const writeLineup = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`라인업 - ${label}`);
    add('타순', '이름', '포지션', '등번호', '투', '타');
    const batting = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    batting.forEach((slot, idx) => add(idx + 1, slot.name, slot.pos, slot.number, slot.throws, slot.bats));
    const pitcher = record.lineups[side].find((slot) => slot.pos.toUpperCase() === 'P');
    if (pitcher) {
      add('P', pitcher.name, pitcher.pos, pitcher.number, pitcher.throws, pitcher.bats);
    }
  };

  const writeBench = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`벤치 - ${label}`);
    add('이름', '포지션', '등번호', '투', '타');
    if (!record.benches[side].length) {
      add('-', '-', '-', '-', '-');
      return;
    }
    record.benches[side].forEach((slot) => add(slot.name, slot.pos, slot.number, slot.throws, slot.bats));
  };

  writeLineup('home', record.meta.homeTeamName);
  writeLineup('away', record.meta.awayTeamName);
  writeBench('home', record.meta.homeTeamName);
  writeBench('away', record.meta.awayTeamName);

  const stats = buildPlayerStats(record);
  const fmt3 = (val: number) => (Number.isFinite(val) ? val.toFixed(3).replace(/^0/, '') : '-');
  const writeHitterStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 타자 기록 - ${label}`);
    add('선수', '포지션', '타석', '타수', '안타', '1루타', '2루타', '3루타', '홈런', '볼넷', '사구', '삼진', '희생', '타율', '출루율');
    stats.hitters[side].forEach((s) => {
      const obpDen = s.ab + s.bb + s.hbp + s.sac;
      const avg = s.ab > 0 ? s.h / s.ab : 0;
      const obp = obpDen > 0 ? (s.h + s.bb + s.hbp) / obpDen : 0;
      add(
        s.name,
        s.pos,
        s.pa,
        s.ab,
        s.h,
        s.singles,
        s.doubles,
        s.triples,
        s.hr,
        s.bb,
        s.hbp,
        s.so,
        s.sac,
        s.ab > 0 ? fmt3(avg) : '-',
        obpDen > 0 ? fmt3(obp) : '-',
      );
    });
  };

  const writePitcherStats = (side: 'home' | 'away', label: string) => {
    addBlank();
    add(`실시간 투수 기록 - ${label}`);
    add('선수', '포지션', '타자상대', '투구수', '투구수(S/B)', '이닝', '피안타', '피홈런', '볼넷', '사구', '탈삼진');
    stats.pitchers[side].forEach((s) => {
      const ip = `${Math.floor(s.outs / 3)}.${s.outs % 3}`;
      add(
        s.name,
        s.pos,
        s.bf,
        s.pitches,
        `${s.pitches} (${s.strikes}/${s.balls})`,
        ip,
        s.h,
        s.hr,
        s.bb,
        s.hbp,
        s.so,
      );
    });
  };

  writeHitterStats('home', record.meta.homeTeamName);
  writeHitterStats('away', record.meta.awayTeamName);
  writePitcherStats('home', record.meta.homeTeamName);
  writePitcherStats('away', record.meta.awayTeamName);

  const events = [...record.events].reverse();
  addBlank();
  add('상세 플레이 이벤트');
  if (events.length) {
    add(
      '이닝',
      '공/말',
      '타순',
      '타자',
      '구수',
      '유형',
      '주자 이동',
      '타구 유형/방향',
      '실책 요약',
      '실책 위치',
      '실책 유형',
      '실책 상황',
      '실책 결과',
      '비고',
    );
    events.forEach((event) => {
      add(
        event.inning,
        halfLabel(event.half),
        event.order || '-',
        event.batter || '-',
        event.pitch,
        event.type,
        event.runners.length ? event.runners.join(' | ') : '-',
        formatBattedBallDetails(event.battedBall),
        formatErrorSummary(event.error),
        formatErrorField(event.error, 'fielderPos'),
        formatErrorField(event.error, 'errorType'),
        formatErrorField(event.error, 'context'),
        formatErrorAdvanceResults(event.error),
        event.notes ?? '-',
      );
    });
  } else {
    add('-', '기록 없음');
  }

  const feed = [...record.feed].reverse();
  addBlank();
  add('플레이 로그');
  if (feed.length) {
    add('이닝', '공/말', '타순', '타자', '구수', '결과');
    feed.forEach((entry) => {
      add(entry.inning, halfLabel(entry.half), entry.order, entry.batter || '-', entry.pitch, entry.result);
    });
  } else {
    add('-', '기록 없음');
  }

  return lines.join('\n');
}

type PlayerStat = BatterStatLine;

function ensurePlayerStat(name: string, pos?: string): PlayerStat {
  return {
    name,
    pos,
    order: null,
    pa: 0,
    ab: 0,
    h: 0,
    singles: 0,
    doubles: 0,
    triples: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    so: 0,
    sac: 0,
  };
}

function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('희생플라이')) return 'sac' as const;
  if (normalized.includes('삼진')) return 'so' as const;
  if (normalized.includes('아웃') && !normalized.includes('도루')) return 'out' as const;
  return null;
}

type PitcherStat = PitcherStatLine;

function ensurePitcherStat(name: string, pos?: string): PitcherStat {
  return {
    name,
    pos,
    bf: 0,
    pitches: 0,
    strikes: 0,
    balls: 0,
    outs: 0,
    h: 0,
    hr: 0,
    bb: 0,
    hbp: 0,
    so: 0,
  };
}

function classifyPitch(result: string) {
  const normalized = result.replace(/\s+/g, '');
  const hasPitch =
    normalized.includes('볼') ||
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('아웃') ||
    normalized.includes('타') ||
    normalized.includes('홈런') ||
    normalized.includes('희생') ||
    normalized.includes('몸에맞는공');
  const isBall = normalized.includes('볼') || normalized.includes('볼넷') || normalized.includes('몸에맞는공');
  const isStrike =
    normalized.includes('스트라이크') ||
    normalized.includes('파울') ||
    normalized.includes('삼진') ||
    normalized.includes('타') ||
    normalized.includes('홈런') ||
    normalized.includes('아웃');
  return { pitch: hasPitch, ball: isBall, strike: isStrike };
}

function buildPlayerStats(record: ReturnType<typeof buildGameRecord>) {
  const rosterHome = new Map<string, { pos?: string; order: number }>();
  const rosterAway = new Map<string, { pos?: string; order: number }>();
  record.lineups.home.forEach((p, idx) => rosterHome.set(p.name, { pos: p.pos, order: idx }));
  record.lineups.away.forEach((p, idx) => rosterAway.set(p.name, { pos: p.pos, order: idx }));

  const benchMetaHome = new Map<string, { pos?: string; order: number }>();
  const benchMetaAway = new Map<string, { pos?: string; order: number }>();
  record.benches.home.forEach((p, idx) => benchMetaHome.set(p.name, { pos: p.pos, order: 100 + idx }));
  record.benches.away.forEach((p, idx) => benchMetaAway.set(p.name, { pos: p.pos, order: 100 + idx }));
  const extraOrder: Record<'home' | 'away', number> = { home: 100, away: 100 };
  const battingOrders: Record<'home' | 'away', Map<number, string[]>> = { home: new Map(), away: new Map() };

  const seedBattingOrders = (side: 'home' | 'away') => {
    const batting = record.lineups[side].filter((slot) => slot.pos.toUpperCase() !== 'P');
    batting.forEach((slot, idx) => battingOrders[side].set(idx + 1, [slot.name]));
  };
  seedBattingOrders('home');
  seedBattingOrders('away');
  const addRemovedOrders = (side: 'home' | 'away') => {
    (record.removed?.[side] ?? []).forEach((p) => {
      const ord = typeof p.order === 'number' && p.order > 0 ? p.order : null;
      if (!ord) return;
      const list = battingOrders[side].get(ord) ?? [];
      if (!list.includes(p.name)) {
        list.unshift(p.name);
      }
      battingOrders[side].set(ord, list);
    });
  };
  addRemovedOrders('home');
  addRemovedOrders('away');

  const statsHome = new Map<string, PlayerStat>();
  const statsAway = new Map<string, PlayerStat>();
  const pitchHome = new Map<string, PitcherStat>();
  const pitchAway = new Map<string, PitcherStat>();
  const pitcherAppearance: Record<'home' | 'away', Map<string, number>> = { home: new Map(), away: new Map() };
  const nextAppearance: Record<'home' | 'away', number> = { home: 0, away: 0 };

  const ensureRosterEntry = (side: 'home' | 'away', name: string) => {
    const roster = side === 'home' ? rosterHome : rosterAway;
    if (roster.has(name)) return roster.get(name)!;
    const benchMeta = side === 'home' ? benchMetaHome : benchMetaAway;
    const meta = benchMeta.get(name);
    const entry = { pos: meta?.pos, order: meta?.order ?? extraOrder[side] };
    extraOrder[side] += 1;
    roster.set(name, entry);
    return entry;
  };

  const addStat = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? statsHome : statsAway;
    if (!store.has(name)) {
      store.set(name, ensurePlayerStat(name, pos));
    }
    return store.get(name)!;
  };

  const addPitch = (side: 'home' | 'away', name: string) => {
    ensureRosterEntry(side, name);
    if (!pitcherAppearance[side].has(name)) {
      pitcherAppearance[side].set(name, nextAppearance[side]);
      nextAppearance[side] += 1;
    }
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? pitchHome : pitchAway;
    if (!store.has(name)) {
      store.set(name, ensurePitcherStat(name, pos));
    }
    return store.get(name)!;
  };

  const chronological = [...record.feed].reverse();
  const currentPitcher: Record<'home' | 'away', string | null> = { home: null, away: null };
  const cleanName = (raw: string) => raw.replace(/\([^)]*\)/g, '').replace(/투수/g, '').replace(/·/g, '').trim();

  const inferPitcherSide = (name: string): 'home' | 'away' | null => {
    if (rosterHome.has(name) || benchMetaHome.has(name)) return 'home';
    if (rosterAway.has(name) || benchMetaAway.has(name)) return 'away';
    return null;
  };

  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();
    const orderNum = typeof entry.order === 'number' && entry.order > 0 ? entry.order : null;

    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) {
        const cleaned = cleanName(incoming);
        const inferred = inferPitcherSide(cleaned) ?? defenseSide;
        currentPitcher[inferred] = cleaned;
        addPitch(inferred, cleaned);
      }
    } else if (result.endsWith('투수')) {
      const cleaned = cleanName(result.replace('투수', ''));
      const inferred = inferPitcherSide(cleaned) ?? defenseSide;
      currentPitcher[inferred] = cleaned;
      addPitch(inferred, cleaned);
    }

    const name = entry.batter?.trim();
    if (!name) return;
    const side = offenseSide;
    ensureRosterEntry(side, name);
    if (orderNum) {
      const list = battingOrders[side].get(orderNum) ?? [];
      if (!list.includes(name)) {
        list.push(name);
      }
      battingOrders[side].set(orderNum, list);
    }

    const pitchSide = side === 'home' ? 'away' : 'home';
    const pitcherName = currentPitcher[pitchSide];
    const pitcherStat = pitcherName ? addPitch(pitchSide, pitcherName) : null;
    const pitchInfo = classifyPitch(result);
    if (pitcherStat && pitchInfo.pitch) {
      pitcherStat.pitches += 1;
      if (pitchInfo.strike) pitcherStat.strikes += 1;
      if (pitchInfo.ball) pitcherStat.balls += 1;
    }
    const kind = classifyResult(result);
    if (!kind) return;
    const stat = addStat(side, name);
    switch (kind) {
      case 'single':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.singles += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'double':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.doubles += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'triple':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.triples += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
        }
        break;
      case 'hr':
        stat.pa += 1;
        stat.ab += 1;
        stat.h += 1;
        stat.hr += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.h += 1;
          pitcherStat.hr += 1;
        }
        break;
      case 'bb':
        stat.pa += 1;
        stat.bb += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.bb += 1;
        }
        break;
      case 'hbp':
        stat.pa += 1;
        stat.hbp += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.hbp += 1;
        }
        break;
      case 'so':
        stat.pa += 1;
        stat.ab += 1;
        stat.so += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
          pitcherStat.so += 1;
        }
        break;
      case 'out':
        stat.pa += 1;
        stat.ab += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        break;
      case 'sac':
        stat.pa += 1;
        stat.sac += 1;
        if (pitcherStat) {
          pitcherStat.bf += 1;
          pitcherStat.outs += 1;
        }
        break;
      default:
        break;
    }
  });

  const toArray = (side: 'home' | 'away', roster: Map<string, { pos?: string; order: number }>, store: Map<string, PlayerStat>) => {
    const rows: PlayerStat[] = [];
    const orderMap = battingOrders[side];
    const orderKeys = [...orderMap.keys()].sort((a, b) => a - b);
    orderKeys.forEach((order) => {
      const players = orderMap.get(order) ?? [];
      players.forEach((playerName, idx) => {
        const meta = roster.get(playerName);
        const stat = store.get(playerName);
        const base = ensurePlayerStat(playerName, meta?.pos);
        const row = stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base;
        rows.push({ ...row, order, status: idx < players.length - 1 ? 'out' : undefined });
      });
    });
    const remaining = [...store.values()].filter(
      (s) =>
        !rows.some((r) => r.name === s.name) &&
        ![...orderMap.values()].some((list) => list.includes(s.name)),
    );
    remaining.forEach((stat) => rows.push({ ...stat, order: null }));
    return rows;
  };

  const toPitcherArray = (
    roster: Map<string, { pos?: string; order: number }>,
    store: Map<string, PitcherStat>,
    appearance: Map<string, number>,
  ) => {
    const names = new Set<string>();
    roster.forEach((meta, name) => {
      if ((meta.pos ?? '').toUpperCase() === 'P') names.add(name);
    });
    store.forEach((_stat, name) => names.add(name));

    const combined = [...names].map((name) => {
      const meta = roster.get(name);
      const base = ensurePitcherStat(name, meta?.pos);
      const stat = store.get(name);
      const appearanceOrder = appearance.get(name);
      return {
        ...(stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base),
        appearanceOrder,
        appearanceLabel:
          appearanceOrder === 0
            ? '선발'
            : Number.isFinite(appearanceOrder)
              ? `계투(${appearanceOrder})`
              : undefined,
      };
    });

    const norm = (n: number | null | undefined) => (Number.isFinite(n) ? (n as number) : Number.MAX_SAFE_INTEGER);
    combined.sort((a, b) => norm(a.appearanceOrder) - norm(b.appearanceOrder) || a.name.localeCompare(b.name, 'ko-KR'));
    return combined;
  };

  return {
    hitters: {
      home: toArray('home', rosterHome, statsHome),
      away: toArray('away', rosterAway, statsAway),
    },
    pitchers: {
      home: toPitcherArray(rosterHome, pitchHome, pitcherAppearance.home),
      away: toPitcherArray(rosterAway, pitchAway, pitcherAppearance.away),
    },
  };
}

export default function ScorekeeperPage() {
  const { state, actions } = useDemoStore();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);
  const hittingSide: Side = state.half === 'top' ? 'away' : 'home';
  const defenseSide: Side = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineupEntries = state.lineups[hittingSide].map((slot, idx) => ({ slot, idx }));
  const offenseBattingEntries = offenseLineupEntries.filter((entry) => entry.slot.pos.toUpperCase() !== 'P');
  const activeOffenseEntries = offenseBattingEntries.length ? offenseBattingEntries : offenseLineupEntries;
  const defenseLineup = state.lineups[defenseSide];
  const activeLineupLength = activeOffenseEntries.length || 1;
  const currentBatterEntry = activeOffenseEntries[state.batterIndex[hittingSide] % activeLineupLength] ?? null;
  const currentBatter = currentBatterEntry?.slot?.name ?? '타자';
  const currentBatterLineupIndex = currentBatterEntry?.idx ?? 0;
  const currentPitcher = defenseLineup.find((slot) => slot.pos.toUpperCase() === 'P')?.name ?? '';
  const [actionModal, setActionModal] = useState<ActionModalData | null>(null);
  const [benchInput, setBenchInput] = useState<{ [K in Side]: { name: string; pos: string; number: string; throws: string; bats: string } }>({
    home: { name: '', pos: '', number: '', throws: 'R', bats: 'R' },
    away: { name: '', pos: '', number: '', throws: 'R', bats: 'R' },
  });
  const [showOutOptions, setShowOutOptions] = useState(false);
  const [hitWizard, setHitWizard] = useState<HitWizardState | null>(null);
  const [manualBroadcast, setManualBroadcast] = useState('');
  const [liveVideoUrlInput, setLiveVideoUrlInput] = useState(state.liveVideoUrl);
  const [hitAdvanceModal, setHitAdvanceModal] = useState<null | { bases: 1 | 2 | 3; selections: RunnerAdvanceSelections }>(null);
  const [battedBallType, setBattedBallType] = useState(battedBallTypeOptions[0]);
  const [battedBallZone, setBattedBallZone] = useState(battedBallZoneOptions[0]);
  const recordPayload = useMemo(() => buildGameRecord(state), [state]);
  const [pendingExportId, setPendingExportId] = useState<string | null>(null);
  const isGameStarted = state.gameStarted;
  const isGameOver = state.gameOver;
  const controlsDisabled = isGameOver || !isGameStarted;
  const isExporting = Boolean(pendingExportId);
  const canUndo = state.history.length > 0;
  const playerStats = useMemo(() => buildPlayerStats(recordPayload), [recordPayload]);
  const statusBadge = isGameOver
    ? {
        text: '경기 종료됨 · 기록 잠금',
        color: '#fca5a5',
        background: 'rgba(248,113,113,0.12)',
        border: 'rgba(248,113,113,0.4)',
      }
    : !isGameStarted
      ? {
          text: '대기 중 · 경기 시작 필요',
          color: '#e2e8f0',
          background: 'rgba(148,163,184,0.16)',
          border: 'rgba(148,163,184,0.35)',
        }
      : {
          text: '실시간 입력 가능',
          color: '#67e8f9',
          background: 'rgba(56,189,248,0.12)',
          border: 'rgba(56,189,248,0.35)',
        };
  const hasLiveUrlChange = liveVideoUrlInput.trim() !== state.liveVideoUrl.trim();
  const battedBallDetails = useMemo<BattedBallDetails | null>(() => {
    return buildBattedBallDetailsFromValues(battedBallType, battedBallZone);
  }, [battedBallType, battedBallZone]);

  useEffect(() => {
    if (state.gameOver) {
      setShowOutOptions(false);
      setHitWizard(null);
    }
  }, [state.gameOver]);

  useEffect(() => {
    setLiveVideoUrlInput(state.liveVideoUrl);
  }, [state.liveVideoUrl]);

  useEffect(() => {
    if (!pendingExportId) return;
    if (state.gameOver && state.endedAt === pendingExportId) {
      const filename = buildDownloadName('scorecard', state.endedAt);
      const csv = buildCsvRecord(recordPayload);
      downloadCsv(csv, filename);
      setPendingExportId(null);
    }
  }, [pendingExportId, recordPayload, state.endedAt, state.gameOver]);

  const openHitAdvanceModal = (bases: 1 | 2 | 3) => {
    if (controlsDisabled) return;
    const selections = state.bases.reduce<RunnerAdvanceSelections>((acc, runner, idx) => {
      if (runner) acc[idx as 0 | 1 | 2] = 'advance';
      return acc;
    }, {});
    setHitAdvanceModal({ bases, selections });
    setActionModal(null);
    setHitWizard(null);
    setShowOutOptions(false);
  };

  const openHitWizardFlow = () => {
    if (controlsDisabled) return;
    setHitWizard((prev) =>
      prev
        ? null
        : {
            step: 'type',
            result: null,
            type: battedBallType,
            zone: battedBallZone,
          },
    );
    setShowOutOptions(false);
  };

  const goToNextHitWizardStep = () =>
    setHitWizard((prev) => {
      if (!prev) return prev;
      if (prev.step === 'type') return { ...prev, step: 'result' };
      if (prev.step === 'result') {
        if (!prev.result) return prev;
        return { ...prev, step: 'zone' };
      }
      return prev;
    });

  const goToPrevHitWizardStep = () =>
    setHitWizard((prev) => {
      if (!prev) return prev;
      if (prev.step === 'zone') return { ...prev, step: 'result' };
      if (prev.step === 'result') return { ...prev, step: 'type' };
      return prev;
    });

  const handleSelectHitResult = (result: HitResultAction) =>
    setHitWizard((prev) => (prev ? { ...prev, result, step: 'zone' } : prev));

  const handleSelectBattedBallType = (type: string) =>
    setHitWizard((prev) => (prev ? { ...prev, type, step: 'result' } : prev));

  const handleSelectBattedBallZone = (zone: string) =>
    setHitWizard((prev) => (prev ? { ...prev, zone } : prev));

  const handleConfirmHitWizard = () => {
    if (!hitWizard?.result || controlsDisabled) {
      setHitWizard(null);
      return;
    }
    const details = buildBattedBallDetailsFromValues(hitWizard.type, hitWizard.zone);
    setBattedBallType(hitWizard.type);
    setBattedBallZone(hitWizard.zone);
    setHitWizard(null);
    switch (hitWizard.result) {
      case 'single':
      case 'single_infield':
      case 'single_bunt':
        openHitAdvanceModal(1);
        break;
      case 'double':
      case 'double_ground':
        openHitAdvanceModal(2);
        break;
      case 'triple':
        openHitAdvanceModal(3);
        break;
      case 'hr':
        actions.homeRun(details);
        break;
      default:
        break;
    }
  };

  const handleAction = (action: string) => {
    if (isGameOver || !isGameStarted) return;
    if (action === 'hitMenu') {
      openHitWizardFlow();
      return;
    }
    if (action === 'outMenu') {
      setShowOutOptions((prev) => !prev);
      setHitWizard(null);
      return;
    }

    switch (action) {
      case 'ball':
        actions.addBall();
        break;
      case 'strike':
        actions.addStrike();
        break;
      case 'foul':
        actions.addFoul();
        break;
      case 'single':
        openHitAdvanceModal(1);
        break;
      case 'double':
        openHitAdvanceModal(2);
        break;
      case 'triple':
        openHitAdvanceModal(3);
        break;
      case 'hr':
        actions.homeRun(battedBallDetails);
        break;
      case 'walk':
        actions.walk();
        break;
      case 'hbp':
        actions.hbp();
        break;
      case 'strikeOut':
        actions.strikeOut();
        break;
      case 'out_ground':
        actions.addOutWithMessage('땅볼 아웃', battedBallDetails);
        break;
      case 'out_fly':
        actions.addOutWithMessage('뜬공 아웃', battedBallDetails);
        break;
      case 'out_line':
        actions.addOutWithMessage('라인드라이브 아웃', battedBallDetails);
        break;
      case 'out_dp2':
        actions.doublePlay(battedBallDetails);
        break;
      case 'out_tp3':
        actions.triplePlay(battedBallDetails);
        break;
      case 'out_infield_fly':
        actions.addOutWithMessage('내야 플라이 아웃', battedBallDetails);
        break;
      case 'out_outfield_fly':
        actions.addOutWithMessage('외야 플라이 아웃', battedBallDetails);
        break;
      case 'out_other':
        actions.addOutWithMessage('기타 아웃', battedBallDetails);
        break;
      case 'sac':
        actions.sacFly(battedBallDetails);
        break;
      case 'resetCount':
        actions.resetCount();
        break;
      case 'clearBases':
        actions.clearBases();
        break;
      case 'nextHalf':
        actions.nextHalf();
        break;
      case 'undo':
        actions.undo();
        break;
      default:
        break;
    }

    setHitWizard(null);
    setShowOutOptions(false);
  };

  const handleConfirmHitAdvance = () => {
    if (!hitAdvanceModal) return;
    const { bases, selections } = hitAdvanceModal;
    if (bases === 1) actions.hitSingle(selections, battedBallDetails);
    if (bases === 2) actions.hitDouble(selections, battedBallDetails);
    if (bases === 3) actions.hitTriple(selections, battedBallDetails);
    setHitAdvanceModal(null);
  };

  const handleManualSubmit = () => {
    const text = manualBroadcast.trim();
    if (!text) return;
    actions.addManualLog(text);
    setManualBroadcast('');
  };

  const handleLiveUrlSave = () => {
    const normalized = normalizeLiveUrl(liveVideoUrlInput);
    setLiveVideoUrlInput(normalized);
    if (normalized !== state.liveVideoUrl) {
      actions.setLiveVideoUrl(normalized);
    }
  };

  const handleStartGame = () => {
    if (isGameStarted || isGameOver) return;
    setHitWizard(null);
    setShowOutOptions(false);
    setActionModal(null);
    actions.startGame();
  };

  const handleEndGame = () => {
    if (!isGameStarted && !state.gameOver) return;
    if (state.gameOver) {
      const filename = buildDownloadName('scorecard', state.endedAt);
      const csv = buildCsvRecord(recordPayload);
      downloadCsv(csv, filename);
      return;
    }
    const endedAt = new Date().toISOString();
    setPendingExportId(endedAt);
    actions.endGame(endedAt);
  };

  const handleNewGame = () => {
    setPendingExportId(null);
    setHitWizard(null);
    setActionModal(null);
    actions.resetGame();
  };

  return (
    <div
      style={{
        borderRadius: '20px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: '#0b0f1a',
        color: '#e2e8f0',
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
      }}
    >
      <header
        style={{
          padding: '12px 18px',
          background: '#111827',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontWeight: 800,
          letterSpacing: '-0.01em',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ padding: '6px 10px', borderRadius: '10px', background: '#f3f4f6', color: '#111827', fontWeight: 900 }}>
            Dashboard
          </span>
          <span style={{ color: '#cbd5e1' }}>
            {state.teamNames.home} {state.score.home} - {state.teamNames.away} {state.score.away} |{' '}
            {state.half === 'top' ? 'Top' : 'Bot'} {state.inning} | B:{state.balls} S:{state.strikes} O:{state.outs}
          </span>
        </div>
        <span style={{ fontSize: '14px', color: '#94a3b8' }}>기록원 컨트롤러 · 데모</span>
      </header>

      <div
        style={{
          display: 'grid',
        gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          padding: '18px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: '12px', minHeight: '680px' }}>
          <FieldView
            bases={state.bases}
            inning={state.inning}
            half={state.half}
            outs={state.outs}
            balls={state.balls}
            strikes={state.strikes}
            batterName={currentBatter}
            defenseAssignments={getDefenseAssignments(defenseLineup)}
            onSelectRunner={(payload) => {
              if (controlsDisabled) return;
              setActionModal({ role: 'runner', ...payload });
            }}
            onSelectBatter={() => {
              if (controlsDisabled) return;
              setActionModal({ role: 'batter', name: currentBatter, side: hittingSide, lineupIndex: currentBatterLineupIndex });
            }}
            onSelectFielder={(payload) => {
              if (controlsDisabled) return;
              setActionModal({ role: 'fielder', ...payload });
            }}
          />
          <div
            style={{
              padding: '14px',
              borderRadius: '14px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255,255,255,0.03)',
              display: 'grid',
              gap: '10px',
              minHeight: '220px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#cbd5e1',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontWeight: 900 }}>Command Center</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: statusBadge.color,
                    background: statusBadge.background,
                    border: `1px solid ${statusBadge.border}`,
                    borderRadius: '999px',
                    padding: '6px 10px',
                  }}
                >
                  {statusBadge.text}
                </span>
                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={isGameOver || isGameStarted}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(16,185,129,0.5)',
                    background: isGameStarted
                      ? 'rgba(148,163,184,0.16)'
                      : 'linear-gradient(90deg, #10b981, #0ea5e9)',
                    color: isGameStarted ? '#cbd5e1' : '#0b0f1a',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: isGameOver || isGameStarted ? 'not-allowed' : 'pointer',
                    opacity: isGameOver ? 0.6 : 1,
                    boxShadow: isGameStarted ? 'none' : '0 10px 20px rgba(16,185,129,0.22)',
                  }}
                >
                  {isGameStarted ? '경기 진행 중' : '경기 시작'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
              {mainButtons.map((btn) => {
                const isUndo = btn.action === 'undo';
                const isHitMenu = btn.action === 'hitMenu';
                const isActive = isHitMenu && Boolean(hitWizard);
                const isDisabled = controlsDisabled || (isUndo && !canUndo);
                return (
                  <button
                    key={btn.label}
                    type="button"
                    disabled={isDisabled}
                    style={{
                      padding: '14px 12px',
                      borderRadius: '12px',
                      border: isUndo ? '1px solid rgba(148,163,184,0.35)' : 'none',
                      background: isUndo
                        ? isDisabled
                          ? 'rgba(148,163,184,0.12)'
                          : 'rgba(148,163,184,0.18)'
                        : btn.color,
                      color: isUndo ? '#e2e8f0' : '#0b0f1a',
                      fontWeight: 900,
                      fontSize: '14px',
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      boxShadow: isUndo ? 'none' : '0 10px 22px rgba(0,0,0,0.25)',
                      outline: isActive ? '2px solid rgba(59,130,246,0.6)' : 'none',
                      opacity: isDisabled ? 0.6 : 1,
                    }}
                    onClick={() => !isDisabled && handleAction(btn.action)}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
            {showOutOptions ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                {outButtons.map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    disabled={controlsDisabled}
                    style={{
                      padding: '10px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(15,23,42,0.4)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fca5a5',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                      opacity: controlsDisabled ? 0.6 : 1,
                    }}
                    onClick={() => handleAction(btn.action)}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
              {secondaryButtons.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  disabled={controlsDisabled}
                  style={{
                    padding: '10px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(15,23,42,0.4)',
                    background: 'rgba(255,255,255,0.06)',
                    color: btn.color,
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: controlsDisabled ? 'not-allowed' : 'pointer',
                    opacity: controlsDisabled ? 0.6 : 1,
                  }}
                  onClick={() => handleAction(btn.action)}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.5)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>기록원 수기 문자 중계</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>경기 전·후에도 전송 가능</span>
              </div>
              <textarea
                value={manualBroadcast}
                onChange={(e) => setManualBroadcast(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') return;
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
                rows={3}
                placeholder="예) 오늘은 비로 인해 경기 시작이 10분 지연됩니다."
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: '72px',
                  padding: '10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(59,130,246,0.4)',
                    background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                    color: '#f8fafc',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 10px 20px rgba(37,99,235,0.25)',
                    opacity: manualBroadcast.trim() ? 1 : 0.7,
                  }}
                  disabled={!manualBroadcast.trim()}
                >
                  문자 중계 전송
                </button>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                문자중계 페이지에 "*기록원* - 내용"으로 바로 반영됩니다. Enter 키로 전송, 줄바꿈은 Ctrl/Cmd+Enter.
              </span>
            </div>
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.48)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>라이브 영상 링크</span>
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 800 }}>Live Overlay 페이지에 반영</span>
              </div>
              <input
                value={liveVideoUrlInput}
                onChange={(e) => setLiveVideoUrlInput(e.target.value)}
                onBlur={() => setLiveVideoUrlInput((val) => normalizeLiveUrl(val))}
                placeholder="YouTube 임베드/공유 링크 또는 플레이어 URL을 입력하세요"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: '#0f172a',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  fontSize: '13px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                  YouTube 공유 링크를 붙여넣으면 임베드 주소로 자동 변환됩니다.
                </span>
                <button
                  type="button"
                  onClick={handleLiveUrlSave}
                  disabled={!hasLiveUrlChange}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid rgba(16,185,129,0.45)',
                    background: hasLiveUrlChange ? 'linear-gradient(90deg, #10b981, #059669)' : 'rgba(148,163,184,0.18)',
                    color: hasLiveUrlChange ? '#0b0f1a' : '#cbd5e1',
                    fontWeight: 900,
                    fontSize: '13px',
                    cursor: hasLiveUrlChange ? 'pointer' : 'not-allowed',
                    boxShadow: hasLiveUrlChange ? '0 10px 20px rgba(16,185,129,0.24)' : 'none',
                    opacity: hasLiveUrlChange ? 1 : 0.8,
                  }}
                >
                  영상 링크 적용
                </button>
              </div>
            </div>
            <div
              style={{
                marginTop: '4px',
                padding: '12px',
                borderRadius: '12px',
                border: '1px dashed rgba(148, 163, 184, 0.3)',
                background: 'rgba(15,23,42,0.45)',
                display: 'grid',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>경기 종료 및 기록 저장</span>
                <span style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8' }}>CSV 기록지 다운로드</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', alignItems: 'center' }}>
                <p style={{ margin: 0, color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>
                  버튼을 누르면 기록 입력이 잠기고 실제 야구 기록지 형태의 CSV 파일을 내려받습니다. 종료 후에도 다시 다운로드할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={handleEndGame}
                  disabled={isExporting}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    background: isGameOver ? 'linear-gradient(90deg, #0f172a, #111827)' : 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                    color: '#e2e8f0',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: isExporting ? 'not-allowed' : 'pointer',
                    boxShadow: isGameOver ? 'none' : '0 10px 22px rgba(37, 99, 235, 0.35)',
                    opacity: isExporting ? 0.6 : 1,
                  }}
                >
                  {isExporting ? '기록 저장 중...' : isGameOver ? 'CSV 기록지 다시 받기' : '경기 종료 & CSV 다운로드'}
                </button>
              </div>
              {state.endedAt ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontWeight: 800, fontSize: '12px' }}>
                  <span
                    style={{
                      padding: '6px 8px',
                      borderRadius: '10px',
                      background: 'rgba(16,185,129,0.12)',
                      border: '1px solid rgba(16,185,129,0.35)',
                      color: '#34d399',
                      fontWeight: 900,
                    }}
                  >
                    종료 시각
                  </span>
                  <span>{formatDateTimeLabel(state.endedAt)}</span>
                </div>
              ) : null}
              {isGameOver ? (
                <button
                  type="button"
                  onClick={handleNewGame}
                  style={{
                    marginTop: '4px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(74, 222, 128, 0.4)',
                    background: 'linear-gradient(90deg, #16a34a, #15803d)',
                    color: '#f8fafc',
                    fontWeight: 900,
                    fontSize: '14px',
                    cursor: 'pointer',
                    boxShadow: '0 12px 24px rgba(22, 163, 74, 0.35)',
                  }}
                >
                  새 경기 시작 (기록 초기화)
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#111827',
            borderRadius: '16px',
            border: '1px solid rgba(148, 163, 184, 0.25)',
            padding: '14px',
            display: 'grid',
            gap: '14px',
            minHeight: '360px',
            gridTemplateColumns: '1fr',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1px 1fr',
              gap: '14px',
              alignItems: 'start',
            }}
          >
            <TeamEditor
              label="HOME"
              defaultName={homeTeam?.name ?? state.teamNames.home}
              side="home"
              teamName={state.teamNames.home}
              lineup={state.lineups.home}
              bench={state.benches.home}
              benchInput={benchInput.home}
              onChangeBenchInput={(val) => setBenchInput((p) => ({ ...p, home: val }))}
              onSetTeamName={actions.setTeamName}
              onSetLineup={actions.setLineup}
              onAddBench={actions.addBench}
              onRemoveBench={actions.removeBench}
              onSubstitute={actions.substitute}
              highlightBatterName={hittingSide === 'home' ? currentBatter : undefined}
              highlightPitcherName={defenseSide === 'home' ? currentPitcher : undefined}
            />
            <div
              aria-hidden
              style={{
                width: '1px',
                background: 'rgba(148, 163, 184, 0.3)',
                borderRadius: '999px',
                alignSelf: 'stretch',
              }}
            />
            <TeamEditor
              label="AWAY"
              defaultName={awayTeam?.name ?? state.teamNames.away}
              side="away"
              teamName={state.teamNames.away}
              lineup={state.lineups.away}
              bench={state.benches.away}
              benchInput={benchInput.away}
              onChangeBenchInput={(val) => setBenchInput((p) => ({ ...p, away: val }))}
              onSetTeamName={actions.setTeamName}
              onSetLineup={actions.setLineup}
              onAddBench={actions.addBench}
              onRemoveBench={actions.removeBench}
              onSubstitute={actions.substitute}
              highlightBatterName={hittingSide === 'away' ? currentBatter : undefined}
              highlightPitcherName={defenseSide === 'away' ? currentPitcher : undefined}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '0 18px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '14px',
        }}
      >
        <div style={{ display: 'grid', gap: '10px' }}>
          <StatsTable title={`${state.teamNames.home} 타자 기록`} stats={playerStats.hitters.home} variant="batter" density="regular" />
          <StatsTable title={`${state.teamNames.home} 투수 기록`} stats={playerStats.pitchers.home} variant="pitcher" density="regular" />
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <StatsTable title={`${state.teamNames.away} 타자 기록`} stats={playerStats.hitters.away} variant="batter" density="regular" />
          <StatsTable title={`${state.teamNames.away} 투수 기록`} stats={playerStats.pitchers.away} variant="pitcher" density="regular" />
        </div>
      </div>

      <div
        style={{
          padding: '0 18px 18px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}
      >
        <RemovedPlayersPanel title="교체 out (HOME)" players={state.removed.home} density="regular" />
        <RemovedPlayersPanel title="교체 out (AWAY)" players={state.removed.away} density="regular" />
      </div>

      {hitWizard && (
        <HitWizardModal
          state={hitWizard}
          onClose={() => setHitWizard(null)}
          onNext={goToNextHitWizardStep}
          onBack={goToPrevHitWizardStep}
          onSelectResult={handleSelectHitResult}
          onSelectType={handleSelectBattedBallType}
          onSelectZone={handleSelectBattedBallZone}
          onConfirm={handleConfirmHitWizard}
        />
      )}
      {actionModal && (
        <ActionModal
          data={actionModal}
          onClose={() => setActionModal(null)}
          actions={actions}
          bases={state.bases}
          bench={state.benches[hittingSide]}
          lineup={state.lineups[hittingSide]}
        />
      )}
      {hitAdvanceModal && (
        <HitAdvanceModal
          bases={hitAdvanceModal.bases}
          basesState={state.bases}
          selections={hitAdvanceModal.selections}
          onChangeSelections={(next) => setHitAdvanceModal((prev) => (prev ? { ...prev, selections: next } : prev))}
          onClose={() => setHitAdvanceModal(null)}
          onConfirm={handleConfirmHitAdvance}
        />
      )}
    </div>
  );
}

function FieldView({
  bases,
  inning,
  half,
  outs,
  balls,
  strikes,
  batterName,
  defenseAssignments,
  onSelectRunner,
  onSelectBatter,
  onSelectFielder,
}: {
  bases: (string | null)[];
  inning: number;
  half: 'top' | 'bottom';
  outs: number;
  balls: number;
  strikes: number;
  batterName: string;
  defenseAssignments: { name: string; pos: string; x: number; y: number }[];
  onSelectRunner: (payload: { base: 0 | 1 | 2; name: string }) => void;
  onSelectBatter: () => void;
  onSelectFielder: (payload: { name: string; pos: string }) => void;
}) {
  const label = `${half === 'top' ? '▲' : '▼'} ${inning}`;
  const baseSize = 'clamp(20px, 3.4vw, 30px)';
  const groundShift = '-4%';
  const positions = {
    second: { x: 50, y: 35 },
    first: { x: 72, y: 63 },
    third: { x: 28, y: 63 },
    home: { x: 50, y: 92 },
    batter: { x: 58, y: 90 },
  };
  return (
    <div
      style={{
        position: 'relative',
        borderRadius: '18px',
        background: '#0b0f1a',
        aspectRatio: '4 / 3',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${groundShift})`,
          pointerEvents: 'none',
        }}
      >
        <FieldSvg />
        <BaselineSvg />
      </div>
      <span
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(148,163,184,0.3)',
          fontWeight: 900,
          color: '#cbd5e1',
          fontSize: '13px',
        }}
      >
        {label}
      </span>
      <OutLights outs={outs} balls={balls} strikes={strikes} />
      <Base
        marker={Boolean(bases[1])}
        label={bases[1] ?? '2'}
        top={`${positions.second.y}%`}
        left={`${positions.second.x}%`}
        size={baseSize}
        onSelect={() => bases[1] && onSelectRunner({ base: 1, name: bases[1] })}
      />
      <Base
        marker={Boolean(bases[0])}
        label={bases[0] ?? '1'}
        top={`${positions.first.y}%`}
        left={`${positions.first.x}%`}
        size={baseSize}
        onSelect={() => bases[0] && onSelectRunner({ base: 0, name: bases[0] })}
      />
      <Base
        marker={Boolean(bases[2])}
        label={bases[2] ?? '3'}
        top={`${positions.third.y}%`}
        left={`${positions.third.x}%`}
        size={baseSize}
        onSelect={() => bases[2] && onSelectRunner({ base: 2, name: bases[2] })}
      />
      <HomePlate occupied={false} size={baseSize} top={`${positions.home.y}%`} left={`${positions.home.x}%`} />
      <BatterBadge name={batterName} top={`${positions.batter.y}%`} left={`${positions.batter.x}%`} onClick={onSelectBatter} />
      <PitcherBadge
        name={defenseAssignments.find((player) => player.pos.toUpperCase() === 'P')?.name ?? '투수'}
        top="54%"
        left="50%"
        onClick={onSelectFielder}
      />
      <DefenseLayer assignments={defenseAssignments.filter((player) => player.pos.toUpperCase() !== 'P')} onSelectFielder={onSelectFielder} />
    </div>
  );
}

function Base({
  marker,
  label,
  top,
  left,
  size,
  onSelect,
}: {
  marker?: boolean;
  label?: string;
  top?: string;
  left?: string;
  size?: string;
  onSelect?: () => void;
}) {
  const clickable = marker && onSelect;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%) rotate(45deg)',
        width: size ?? '28px',
        height: size ?? '28px',
        background: '#f4f4f5',
        borderRadius: '4px',
        border: '2px solid #e5e7eb',
        display: 'grid',
        placeItems: 'center',
        boxShadow: marker ? '0 0 0 8px rgba(248, 113, 113, 0.2)' : undefined,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 120ms ease, box-shadow 120ms ease',
        ...(clickable
          ? {
              transformOrigin: 'center',
            }
          : {}),
      }}
      role={clickable ? 'button' : undefined}
      onClick={() => clickable && onSelect?.()}
      onMouseEnter={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translate(-50%, -50%) rotate(45deg) scale(1.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (clickable) {
          (e.currentTarget as HTMLDivElement).style.transform = 'translate(-50%, -50%) rotate(45deg)';
        }
      }}
    >
      {marker && (
        <span
          style={{
            transform: 'rotate(-45deg)',
            fontWeight: 900,
            color: '#ef4444',
            fontSize: '10px',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function HomePlate({ occupied, size, top, left }: { occupied: boolean; size?: string; top?: string; left?: string }) {
  const plateWidth = size ? `calc(${size} * 1.5)` : '44px';
  const plateHeight = size ? `calc(${size} * 1.2)` : '36px';
  return (
    <div
      style={{
        position: 'absolute',
        top: top ?? '72%',
        left: left ?? '50%',
        transform: 'translate(-50%, -50%)',
        width: plateWidth,
        height: plateHeight,
        background: '#e5e7eb',
        clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)',
        border: occupied ? '2px solid #f97316' : '2px solid #d1d5db',
        boxShadow: occupied ? '0 0 0 8px rgba(249, 115, 22, 0.2)' : undefined,
      }}
    />
  );
}

function BaselineSvg() {
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <polyline
        points="50,72 72,50 50,28 28,50 50,72"
        fill="none"
        stroke="rgba(226,232,240,0.35)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <line x1="50" y1="72" x2="2" y2="24" stroke="rgba(226,232,240,0.25)" strokeWidth="1.4" />
      <line x1="50" y1="72" x2="98" y2="24" stroke="rgba(226,232,240,0.25)" strokeWidth="1.4" />
    </svg>
  );
}

function OutLights({ outs, balls, strikes }: { outs: number; balls: number; strikes: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: '12px',
        background: 'rgba(15,23,42,0.8)',
        border: '1px solid rgba(148,163,184,0.3)',
      }}
    >
      <CounterDots label="B" count={balls} max={3} color="#22c55e" />
      <CounterDots label="S" count={strikes} max={2} color="#facc15" />
      <CounterDots label="O" count={outs} max={3} color="#ef4444" />
    </div>
  );
}

function CounterDots({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ color, fontWeight: 900, fontSize: '13px', width: '16px' }}>{label}</span>
      {[...Array(max)].map((_, idx) => (
        <span
          key={idx}
          style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: count > idx ? color : 'transparent',
            border: `1px solid ${color}80`,
            boxShadow: count > idx ? `0 0 10px ${color}99` : `inset 0 0 0 1px ${color}55`,
          }}
        />
      ))}
    </div>
  );
}

function DefenseLayer({
  assignments,
  onSelectFielder,
}: {
  assignments: { name: string; pos: string; x: number; y: number }[];
  onSelectFielder: (payload: { name: string; pos: string }) => void;
}) {
  return (
    <>
      {assignments.map((player) => (
        <div
          key={player.name + player.pos}
          role="button"
          onClick={() => onSelectFielder({ name: player.name, pos: player.pos })}
          style={{
            position: 'absolute',
            top: `${player.y}%`,
            left: `${player.x}%`,
            transform: 'translate(-50%, -50%)',
            padding: '6px 8px',
            borderRadius: '12px',
            background: 'rgba(15,23,42,0.75)',
            border: '1px solid rgba(148,163,184,0.3)',
            color: '#e2e8f0',
            fontWeight: 800,
            fontSize: '11px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          }}
        >
          {player.pos} · {player.name}
        </div>
      ))}
    </>
  );
}

function BatterBadge({ name, top, left, onClick }: { name: string; top: string; left: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(148,163,184,0.35)',
        background: 'rgba(99,102,241,0.18)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: '12px',
        cursor: 'pointer',
        boxShadow: '0 6px 16px rgba(0,0,0,0.3)',
      }}
    >
      타석 · {name}
    </button>
  );
}

function PitcherBadge({
  name,
  top,
  left,
  onClick,
}: {
  name: string;
  top: string;
  left: string;
  onClick: (payload: { name: string; pos: string }) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick({ name, pos: 'P' })}
      style={{
        position: 'absolute',
        top,
        left,
        transform: 'translate(-50%, -50%)',
        padding: '8px 10px',
        borderRadius: '12px',
        border: '1px solid rgba(148,163,184,0.3)',
        background: 'rgba(15,23,42,0.75)',
        color: '#e2e8f0',
        fontWeight: 900,
        fontSize: '12px',
        cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      }}
    >
      투수 · {name}
    </button>
  );
}

function FieldSvg() {
  return (
    <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#166534" />
          <stop offset="100%" stopColor="#0f3d1f" />
        </linearGradient>
        <linearGradient id="dirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b7791f" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#grass)" />
      <path d="M 50 72 L 2 24 Q 50 -15 98 24 Z" fill="rgba(22,101,52,0.92)" />
      <polygon points="50,28 72,50 50,72 28,50" fill="url(#dirt)" />
      <circle cx="50" cy="50" r="3.5" fill="#a16207" stroke="rgba(0,0,0,0.25)" strokeWidth="0.4" />
      <circle cx="50" cy="50" r="1.2" fill="#e2e8f0" opacity="0.4" />
      <rect x="43.5" y="64" width="4" height="7" fill="transparent" stroke="rgba(148,163,184,0.5)" strokeWidth="0.6" />
      <rect x="52.5" y="64" width="4" height="7" fill="transparent" stroke="rgba(148,163,184,0.5)" strokeWidth="0.6" />
    </svg>
  );
}

const runnerOutcomeOptions: { value: RunnerAdvanceOutcome; label: string; color: string }[] = [
  { value: 'hold', label: '정지', color: '#e2e8f0' },
  { value: 'advance', label: '진루', color: '#22c55e' },
  { value: 'out', label: '아웃', color: '#ef4444' },
  { value: 'score', label: '득점', color: '#f97316' },
];

function baseLabelForIndex(baseIndex: number) {
  return `${baseIndex + 1}루`;
}

function HitAdvanceModal({
  bases,
  basesState,
  selections,
  onChangeSelections,
  onClose,
  onConfirm,
}: {
  bases: 1 | 2 | 3;
  basesState: (string | null)[];
  selections: RunnerAdvanceSelections;
  onChangeSelections: (next: RunnerAdvanceSelections) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const hitLabel = `${bases}루타 주자 선택`;
  const runners = basesState
    .map((runner, idx) => (runner ? { runner, baseIndex: idx as 0 | 1 | 2 } : null))
    .filter(Boolean) as { runner: string; baseIndex: 0 | 1 | 2 }[];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>{hitLabel}</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>주자별 결과를 선택하세요.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          {runners.length ? (
            runners.map((entry) => (
              <div
                key={`${entry.baseIndex}-${entry.runner}`}
                style={{
                  borderRadius: '12px',
                  border: '1px solid rgba(148,163,184,0.25)',
                  padding: '12px',
                  background: 'rgba(255,255,255,0.04)',
                  display: 'grid',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 900 }}>
                    {baseLabelForIndex(entry.baseIndex)} 주자 · {entry.runner}
                  </span>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700 }}>기본값: 진루</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                  {runnerOutcomeOptions.map((option) => {
                    const isSelected = selections[entry.baseIndex] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          onChangeSelections({
                            ...selections,
                            [entry.baseIndex]: option.value,
                          })
                        }
                        style={{
                          padding: '10px',
                          borderRadius: '10px',
                          border: isSelected ? `1px solid ${option.color}` : '1px solid rgba(148,163,184,0.2)',
                          background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                          color: option.color,
                          fontWeight: 900,
                          cursor: 'pointer',
                          boxShadow: isSelected ? `0 0 0 1px ${option.color}60` : 'none',
                        }}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div
              style={{
                borderRadius: '12px',
                border: '1px dashed rgba(148,163,184,0.3)',
                padding: '14px',
                textAlign: 'center',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              베이스에 주자가 없습니다. 기본 진루로 기록됩니다.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(59,130,246,0.4)',
              background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
              color: '#f8fafc',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            적용하기
          </button>
        </div>
      </div>
    </div>
  );
}

function HitWizardModal({
  state,
  onClose,
  onNext,
  onBack,
  onSelectResult,
  onSelectType,
  onSelectZone,
  onConfirm,
}: {
  state: HitWizardState;
  onClose: () => void;
  onNext: () => void;
  onBack: () => void;
  onSelectResult: (result: HitResultAction) => void;
  onSelectType: (type: string) => void;
  onSelectZone: (zone: string) => void;
  onConfirm: () => void;
}) {
  const steps: { key: HitWizardStep; label: string }[] = [
    { key: 'type', label: '인플레이 유형' },
    { key: 'result', label: '타구 결과' },
    { key: 'zone', label: '타구 방향' },
  ];
  const currentStepIndex = steps.findIndex((step) => step.key === state.step);
  const selectedResult = hitResultOptions.find((option) => option.value === state.result);
  const selectionSummary = formatBattedBallDetails(buildBattedBallDetailsFromValues(state.type, state.zone));
  const isFinalStep = state.step === 'zone';
  const primaryDisabled = state.step === 'result' && !state.result;

  const renderStep = () => {
    if (state.step === 'type') {
      return (
        <div style={{ display: 'grid', gap: '10px' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '14px' }}>어떤 유형의 인플레이 타구였나요?</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
            {battedBallTypeOptions.map((option) => {
              const isSelected = state.type === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onSelectType(option)}
                  style={{
                    padding: '10px',
                    borderRadius: '10px',
                    border: isSelected ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(148,163,184,0.25)',
                    background: isSelected ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                    color: '#e2e8f0',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: isSelected ? '0 0 0 1px rgba(59,130,246,0.35)' : 'none',
                  }}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>선택 후 타구 결과를 고를 수 있습니다.</span>
        </div>
      );
    }

    if (state.step === 'result') {
      return (
        <div style={{ display: 'grid', gap: '10px' }}>
          <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '14px' }}>기록할 타구 결과를 선택하세요.</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            {hitResultOptions.map((option) => {
              const isSelected = state.result === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSelectResult(option.value)}
                  style={{
                    padding: '12px 10px',
                    borderRadius: '12px',
                    border: isSelected ? `2px solid ${option.color}` : '1px solid rgba(148,163,184,0.25)',
                    background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                    color: option.color,
                    fontWeight: 900,
                    textAlign: 'left',
                    boxShadow: isSelected ? `0 0 0 1px ${option.color}50` : 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div>{option.label}</div>
                  <div style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 700 }}>{option.helper}</div>
                </button>
              );
            })}
          </div>
          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>선택 후 바로 방향을 고를 수 있습니다.</span>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: '10px' }}>
        <span style={{ color: '#cbd5e1', fontWeight: 800, fontSize: '14px' }}>타구가 향한 방향을 선택하세요.</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
          {battedBallZoneOptions.map((option) => {
            const isSelected = state.zone === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onSelectZone(option)}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: isSelected ? '1px solid rgba(52,211,153,0.6)' : '1px solid rgba(148,163,184,0.25)',
                  background: isSelected ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.03)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: isSelected ? '0 0 0 1px rgba(52,211,153,0.35)' : 'none',
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
        <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>선택이 없으면 "선택 안 함"으로 기록됩니다.</span>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1100,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '14px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>타격 기록</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>유형 → 결과 → 방향 순서로 안내합니다.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', alignItems: 'center' }}>
          {steps.map((step, idx) => {
            const isActive = idx === currentStepIndex;
            const isDone = idx < currentStepIndex;
            return (
              <div
                key={step.key}
                style={{
                  padding: '10px',
                  borderRadius: '10px',
                  border: isActive ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(148,163,184,0.25)',
                  background: isDone ? 'rgba(59,130,246,0.08)' : isActive ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                  color: '#e2e8f0',
                  fontWeight: 800,
                  textAlign: 'center',
                  fontSize: '13px',
                }}
              >
                {idx + 1}. {step.label}
              </div>
            );
          })}
        </div>

        {renderStep()}

        <div
          style={{
            padding: '10px 12px',
            borderRadius: '12px',
            border: '1px dashed rgba(148,163,184,0.4)',
            background: 'rgba(255,255,255,0.02)',
            display: 'grid',
            gap: '6px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>선택 요약</span>
          <span style={{ color: '#e2e8f0', fontWeight: 900 }}>
            {selectedResult ? selectedResult.label : '결과 미선택'} · {selectionSummary}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid rgba(148,163,184,0.35)',
              background: 'transparent',
              color: '#cbd5e1',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            취소
          </button>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onBack}
              disabled={state.step === 'type'}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(148,163,184,0.35)',
                background: state.step === 'type' ? 'rgba(148,163,184,0.15)' : 'transparent',
                color: '#cbd5e1',
                fontWeight: 900,
                cursor: state.step === 'type' ? 'not-allowed' : 'pointer',
                opacity: state.step === 'type' ? 0.6 : 1,
              }}
            >
              이전
            </button>
            <button
              type="button"
              onClick={isFinalStep ? onConfirm : onNext}
              disabled={primaryDisabled}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid rgba(59,130,246,0.4)',
                background: 'linear-gradient(90deg, #2563eb, #1d4ed8)',
                color: '#f8fafc',
                fontWeight: 900,
                cursor: primaryDisabled ? 'not-allowed' : 'pointer',
                opacity: primaryDisabled ? 0.6 : 1,
                boxShadow: primaryDisabled ? 'none' : '0 10px 20px rgba(37,99,235,0.25)',
              }}
            >
              {isFinalStep ? '기록하기' : '다음'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionModal({
  data,
  onClose,
  actions,
  bases,
  bench,
  lineup,
}: {
  data: ActionModalData;
  onClose: () => void;
  actions: ReturnType<typeof useDemoStore>['actions'];
  bases: (string | null)[];
  bench: { name: string; pos: string; number: string; throws: string; bats: string }[];
  lineup: { name: string; pos: string; number: string; throws: string; bats: string }[];
}) {
  const [errorType, setErrorType] = useState(errorTypeOptions[0]);
  const [errorContext, setErrorContext] = useState('');
  const [errorBatterResult, setErrorBatterResult] = useState<'out' | 1 | 2 | 3 | 4>(1);
  const [runnerSelections, setRunnerSelections] = useState<RunnerAdvanceSelections>({});

  useEffect(() => {
    if (data.role !== 'fielder') return;
    setErrorType(errorTypeOptions[0]);
    setErrorContext('');
    setErrorBatterResult(1);
    const initialSelections = bases.reduce<RunnerAdvanceSelections>((acc, runner, idx) => {
      if (runner) acc[idx as 0 | 1 | 2] = 'hold';
      return acc;
    }, {});
    setRunnerSelections(initialSelections);
  }, [bases, data.role]);

  const battingOrder =
    data.role === 'batter'
      ? (() => {
          const slot = lineup[data.lineupIndex];
          if (!slot || slot.pos.toUpperCase() === 'P') return null;
          let order = 0;
          for (let i = 0; i < lineup.length; i += 1) {
            const player = lineup[i];
            if (player.pos.toUpperCase() === 'P') continue;
            order += 1;
            if (i === data.lineupIndex) return order;
          }
          return order || null;
        })()
      : null;

  const currentSlot = data.role === 'batter' ? lineup[data.lineupIndex] : null;

  const handleSubstitute = (benchIndex: number) => {
    if (data.role !== 'batter') return;
    actions.substitute(data.side, benchIndex, data.lineupIndex);
    onClose();
  };

  const renderButtons = () => {
    if (data.role === 'runner') {
      return (
        <>
          <RunnerActionButton label="도루 성공" color="#22c55e" onClick={() => actions.runnerStealSuccess(data.base)} />
          <RunnerActionButton label="도루자 아웃" color="#ef4444" onClick={() => actions.runnerCaught(data.base)} />
          <RunnerActionButton label="견제사" color="#ef4444" onClick={() => actions.runnerPickoff(data.base)} />
          <RunnerActionButton label="주루사" color="#ef4444" onClick={() => actions.runnerOut(data.base)} />
        </>
      );
    }
    if (data.role === 'fielder') {
      return (
        <>
          <RunnerActionButton
            label="실책 기록"
            color="#f97316"
            onClick={() => {
            actions.recordError({
              fielderPos: data.pos,
              errorType,
              context: errorContext.trim(),
              advanceResults: { batter: errorBatterResult, runners: runnerSelections },
            });
            onClose();
          }}
          />
          <RunnerActionButton label="포구 완료" color="#22c55e" onClick={() => actions.setPlay(`포구 · ${data.pos} ${data.name}`)} />
          <RunnerActionButton label="중계 플레이" color="#38bdf8" onClick={() => actions.setPlay(`중계 · ${data.pos} ${data.name}`)} />
        </>
      );
    }
    return null;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '18px',
          display: 'grid',
          gap: '12px',
          color: '#e2e8f0',
          boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontWeight: 900 }}>{labelForModal(data)}</span>
            <span style={{ color: '#94a3b8', fontWeight: 700 }}>{subLabelForModal(data)}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
        {data.role === 'batter' ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15,23,42,0.55)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: '4px' }}>
                <span style={{ fontWeight: 900, color: '#e2e8f0' }}>타자 교체/대타</span>
                <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                  {battingOrder ? `${battingOrder}번 타순` : '타순 미지정'} · 포지션 {currentSlot?.pos ?? '-'}
                </span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>교체 즉시 라인업/피드 반영</span>
            </div>
            <div
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: '1px dashed rgba(148,163,184,0.35)',
                background: 'rgba(255,255,255,0.03)',
                display: 'grid',
                gap: '4px',
              }}
            >
              <span style={{ color: '#cbd5e1', fontWeight: 800 }}>현재 타자</span>
              <span style={{ color: '#e2e8f0', fontWeight: 900 }}>{currentSlot?.name ?? data.name}</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                등번호 {currentSlot?.number || '-'} · 투 {currentSlot?.throws || '-'} · 타 {currentSlot?.bats || '-'}
              </span>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <span style={{ fontWeight: 800, color: '#cbd5e1', fontSize: '13px' }}>벤치에서 교체할 선수를 선택하세요</span>
              {bench.length ? (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {bench.map((player, idx) => (
                    <div
                      key={`${player.name}-${idx}`}
                      style={{
                        borderRadius: '12px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        padding: '10px',
                        background: 'rgba(255,255,255,0.03)',
                        display: 'grid',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: '2px' }}>
                          <span style={{ fontWeight: 900, color: '#e2e8f0' }}>
                            {player.name} · {player.pos}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
                            등번호 {player.number || '-'} · 투 {player.throws || '-'} · 타 {player.bats || '-'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSubstitute(idx)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: '10px',
                            border: '1px solid rgba(74,222,128,0.5)',
                            background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                            color: '#0b0f1a',
                            fontWeight: 900,
                            cursor: 'pointer',
                            boxShadow: '0 8px 16px rgba(34,197,94,0.25)',
                          }}
                        >
                          이 선수로 교체
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    borderRadius: '12px',
                    border: '1px dashed rgba(148,163,184,0.35)',
                    padding: '12px',
                    color: '#94a3b8',
                    fontWeight: 700,
                    textAlign: 'center',
                    background: 'rgba(255,255,255,0.02)',
                  }}
                >
                  벤치 명단이 없습니다. Team Editor에서 선수를 추가하세요.
                </div>
              )}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>
              교체 시 이전 선수는 교체 out 패널에 기록되고 볼카운트는 유지됩니다.
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148,163,184,0.35)',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                닫기
              </button>
            </div>
          </div>
        ) : null}
        {data.role === 'fielder' ? (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(15,23,42,0.55)',
              display: 'grid',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 900, color: '#e2e8f0' }}>실책 상세 입력</span>
              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>기록/CSV에 반영</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
                에러 유형
                <select
                  value={errorType}
                  onChange={(e) => setErrorType(e.target.value)}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0b0f1a',
                    color: '#e2e8f0',
                    padding: '8px 10px',
                    fontWeight: 800,
                  }}
                >
                  {errorTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
                상황
                <input
                  value={errorContext}
                  onChange={(e) => setErrorContext(e.target.value)}
                  placeholder="예) 내야 타구 처리, 포구 후 송구"
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0b0f1a',
                    color: '#e2e8f0',
                    padding: '8px 10px',
                    fontWeight: 800,
                  }}
                />
              </label>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              <label style={{ display: 'grid', gap: '6px', color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>
                타자 결과
                <select
                  value={String(errorBatterResult)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setErrorBatterResult(value === 'out' ? 'out' : (Number(value) as 1 | 2 | 3 | 4));
                  }}
                  style={{
                    borderRadius: '10px',
                    border: '1px solid rgba(148,163,184,0.35)',
                    background: '#0b0f1a',
                    color: '#e2e8f0',
                    padding: '8px 10px',
                    fontWeight: 800,
                    maxWidth: '220px',
                  }}
                >
                  <option value="out">아웃</option>
                  <option value="1">1루 진루</option>
                  <option value="2">2루 진루</option>
                  <option value="3">3루 진루</option>
                  <option value="4">홈 득점</option>
                </select>
              </label>
              <div style={{ display: 'grid', gap: '6px' }}>
                <span style={{ color: '#cbd5e1', fontSize: '12px', fontWeight: 800 }}>주자 결과</span>
                {bases.map((runner, idx) =>
                  runner ? (
                    <label
                      key={`${runner}-${idx}`}
                      style={{ display: 'grid', gap: '4px', color: '#e2e8f0', fontSize: '12px', fontWeight: 700 }}
                    >
                      {baseLabel(idx)} 주자 · {runner}
                      <select
                        value={runnerSelections[idx as 0 | 1 | 2] ?? 'hold'}
                        onChange={(e) =>
                          setRunnerSelections((prev) => ({
                            ...prev,
                            [idx]: e.target.value as RunnerAdvanceOutcome,
                          }))
                        }
                        style={{
                          borderRadius: '10px',
                          border: '1px solid rgba(148,163,184,0.35)',
                          background: '#0b0f1a',
                          color: '#e2e8f0',
                          padding: '6px 8px',
                          fontWeight: 800,
                          maxWidth: '180px',
                        }}
                      >
                        <option value="hold">유지</option>
                        <option value="advance">진루</option>
                        <option value="score">득점</option>
                        <option value="out">아웃</option>
                      </select>
                    </label>
                  ) : null,
                )}
                {!bases.some(Boolean) ? (
                  <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>현재 주자 없음</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {data.role !== 'batter' ? (
          <>
            <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>{renderButtons()}</div>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
              이벤트 확정 시 DB 저장 훅으로 연결해 텍스트 기록과 동일하게 남길 수 있습니다.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function labelForModal(data: ActionModalData) {
  if (data.role === 'runner') return `주자 액션 · ${data.name}`;
  if (data.role === 'batter') return `타자 교체 · ${data.name}`;
  return `수비 액션 · ${data.pos} ${data.name}`;
}

function subLabelForModal(data: ActionModalData) {
  if (data.role === 'runner') return `${data.base + 1}루 주자`;
  if (data.role === 'batter') return '벤치에서 대타/교체 선택';
  return '수비 위치 선택';
}

function RunnerActionButton({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px',
        borderRadius: '12px',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        background: 'rgba(255,255,255,0.04)',
        color,
        fontWeight: 900,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function TeamEditor({
  label,
  defaultName,
  side,
  teamName,
  lineup,
  bench,
  benchInput,
  onChangeBenchInput,
  onSetTeamName,
  onSetLineup,
  onAddBench,
  onRemoveBench,
  onSubstitute,
  highlightBatterName,
  highlightPitcherName,
}: {
  label: string;
  defaultName: string;
  side: Side;
  teamName: string;
  lineup: { name: string; pos: string; number: string; throws: string; bats: string }[];
  bench: { name: string; pos: string; number: string; throws: string; bats: string }[];
  benchInput: { name: string; pos: string; number: string; throws: string; bats: string };
  onChangeBenchInput: (val: { name: string; pos: string; number: string; throws: string; bats: string }) => void;
  onSetTeamName: (side: Side, name: string) => void;
  onSetLineup: (side: Side, index: number, updates: { name?: string; pos?: string; number?: string; throws?: string; bats?: string }) => void;
  onAddBench: (side: Side, player: { name: string; pos: string; number: string; throws: string; bats: string }) => void;
  onRemoveBench: (side: Side, benchIndex: number) => void;
  onSubstitute: (side: Side, benchIndex: number, lineupIndex: number) => void;
  highlightBatterName?: string;
  highlightPitcherName?: string;
}) {
  const lineupEntries = lineup.map((slot, idx) => ({ slot, idx }));
  const battingEntries = lineupEntries.filter((entry) => entry.slot.pos.toUpperCase() !== 'P');
  const pitcherEntry = lineupEntries.find((entry) => entry.slot.pos.toUpperCase() === 'P');
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 800, color: '#cbd5e1' }}>{label}</span>
        <input
          value={teamName}
          onChange={(e) => onSetTeamName(side, e.target.value)}
          placeholder={defaultName}
          style={{
            background: '#0b0f1a',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '10px',
            padding: '8px 10px',
            color: '#e2e8f0',
            fontWeight: 800,
            width: '70%',
          }}
        />
      </div>
      <div
        style={{
          background: '#0b0f1a',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        {battingEntries.map((entry, orderIdx) => (
          <div
            key={entry.idx}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 85px 55px 50px 70px 70px',
              gap: '8px',
              alignItems: 'center',
              padding: '4px',
              borderRadius: '10px',
              border: `1px solid ${
                highlightBatterName && entry.slot.name === highlightBatterName ? 'rgba(56,189,248,0.6)' : 'transparent'
              }`,
              background:
                highlightBatterName && entry.slot.name === highlightBatterName ? 'rgba(56,189,248,0.12)' : 'transparent',
              boxSizing: 'border-box',
            }}
          >
            <span style={{ color: '#94a3b8', fontWeight: 800 }}>{orderIdx + 1}.</span>
            <input
              value={entry.slot.name}
              onChange={(e) => onSetLineup(side, entry.idx, { name: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
                width: '100%',
              }}
            />
            <input
              value={entry.slot.pos}
              onChange={(e) => onSetLineup(side, entry.idx, { pos: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <input
              value={entry.slot.number}
              onChange={(e) => onSetLineup(side, entry.idx, { number: e.target.value })}
              placeholder="#"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            />
            <select
              value={entry.slot.throws}
              onChange={(e) => onSetLineup(side, entry.idx, { throws: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <option value="R">투 R</option>
              <option value="L">투 L</option>
            </select>
            <select
              value={entry.slot.bats}
              onChange={(e) => onSetLineup(side, entry.idx, { bats: e.target.value })}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                padding: '8px 10px',
                color: '#e2e8f0',
                fontWeight: 800,
              }}
            >
              <option value="R">타 R</option>
              <option value="L">타 L</option>
            </select>
          </div>
        ))}
        <div
          style={{
            marginTop: '6px',
            padding: '10px',
            borderRadius: '10px',
            border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(255,255,255,0.03)',
            display: 'grid',
            gap: '6px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#cbd5e1' }}>투수</span>
          {pitcherEntry ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '85px 50px 70px 70px 50px',
                gap: '8px',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '10px',
                border: `1px solid ${
                  highlightPitcherName && pitcherEntry.slot.name === highlightPitcherName ? 'rgba(244,114,182,0.6)' : 'transparent'
                }`,
                background:
                  highlightPitcherName && pitcherEntry.slot.name === highlightPitcherName ? 'rgba(244,114,182,0.12)' : 'transparent',
                boxSizing: 'border-box',
              }}
            >
              <input
                value={pitcherEntry.slot.name}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { name: e.target.value, pos: 'P' })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              />
              <input
                value={pitcherEntry.slot.number}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { number: e.target.value })}
                placeholder="#"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              />
              <select
                value={pitcherEntry.slot.throws}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { throws: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="R">투 R</option>
                <option value="L">투 L</option>
              </select>
              <select
                value={pitcherEntry.slot.bats}
                onChange={(e) => onSetLineup(side, pitcherEntry.idx, { bats: e.target.value })}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#e2e8f0',
                  fontWeight: 800,
                }}
              >
                <option value="R">타 R</option>
                <option value="L">타 L</option>
              </select>
              <input
                value="P"
                readOnly
                style={{
                  background: 'rgba(15,23,42,0.8)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  borderRadius: '10px',
                  padding: '8px 10px',
                  color: '#94a3b8',
                  fontWeight: 800,
                  textAlign: 'center',
                }}
              />
            </div>
          ) : (
            <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>투수 미지정</span>
          )}
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px dashed rgba(148, 163, 184, 0.25)',
          padding: '10px 12px',
          display: 'grid',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={benchInput.name}
            placeholder="후보 이름"
            onChange={(e) => onChangeBenchInput({ ...benchInput, name: e.target.value })}
            style={{
              flex: 1,
              minWidth: '120px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.number}
            placeholder="등번호"
            onChange={(e) => onChangeBenchInput({ ...benchInput, number: e.target.value })}
            style={{
              width: '70px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <input
            value={benchInput.pos}
            placeholder="포지션"
            onChange={(e) => onChangeBenchInput({ ...benchInput, pos: e.target.value })}
            style={{
              width: '90px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          />
          <select
            value={benchInput.throws}
            onChange={(e) => onChangeBenchInput({ ...benchInput, throws: e.target.value })}
            style={{
              width: '100px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
            }}
          >
            <option value="R">투 R</option>
            <option value="L">투 L</option>
          </select>
          <select
            value={benchInput.bats}
            onChange={(e) => onChangeBenchInput({ ...benchInput, bats: e.target.value })}
            style={{
              width: '100px',
              background: '#0b0f1a',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              borderRadius: '10px',
              padding: '8px 10px',
              color: '#e2e8f0',
              fontWeight: 800,
                }}
              >
                <option value="R">타 R</option>
                <option value="L">타 L</option>
              </select>
          <button
            type="button"
            onClick={() => {
              if (!benchInput.name.trim()) return;
              onAddBench(side, {
                name: benchInput.name,
                pos: benchInput.pos || 'PH',
                number: benchInput.number,
                throws: benchInput.throws,
                bats: benchInput.bats,
              });
              onChangeBenchInput({ name: '', pos: '', number: '', throws: 'R', bats: 'R' });
            }}
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              background: 'rgba(255,255,255,0.08)',
              color: '#cbd5e1',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            후보 추가
          </button>
        </div>
        <div style={{ display: 'grid', gap: '8px' }}>
          {bench.map((player, benchIdx) => (
            <div
              key={player.name + benchIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 90px 1fr',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: '10px',
                padding: '8px 10px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
              }}
            >
              <div style={{ display: 'grid', gap: '2px' }}>
                <span style={{ fontWeight: 800 }}>{player.name}</span>
                <span style={{ color: '#94a3b8', fontWeight: 700 }}>
                  #{player.number || '--'} · {player.pos} · 투 {player.throws} / 타 {player.bats}
                </span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>→ 라인업 투입</span>
              <div style={{ display: 'grid', gap: '8px', width: '100%' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    gap: '6px',
                  }}
                >
                  {battingEntries.map((entry, orderIdx) => (
                    <button
                      key={entry.idx}
                      type="button"
                      onClick={() => onSubstitute(side, benchIdx, entry.idx)}
                      style={{
                        width: '100%',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.3)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {orderIdx + 1}번
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {pitcherEntry ? (
                    <button
                      type="button"
                      onClick={() => onSubstitute(side, benchIdx, pitcherEntry.idx)}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.3)',
                        background: 'rgba(255,255,255,0.04)',
                        color: '#cbd5e1',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      투수
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveBench(side, benchIdx)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239,68,68,0.45)',
                      background: 'rgba(248,113,113,0.08)',
                      color: '#fca5a5',
                      fontWeight: 900,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getDefenseAssignments(lineup: { name: string; pos: string }[]) {
  const posMap: Record<string, { x: number; y: number }> = {
    P: { x: 50, y: 54 },
    C: { x: 50, y: 84 },
    '1B': { x: 76, y: 52 },
    '2B': { x: 62, y: 40 },
    SS: { x: 38, y: 40 },
    '3B': { x: 24, y: 52 },
    LF: { x: 18, y: 20 },
    CF: { x: 50, y: 12 },
    RF: { x: 82, y: 20 },
  };
  const fallback: { x: number; y: number }[] = [
    { x: 50, y: 54 },
    { x: 50, y: 84 },
    { x: 76, y: 52 },
    { x: 62, y: 40 },
    { x: 38, y: 40 },
    { x: 24, y: 52 },
    { x: 18, y: 20 },
    { x: 50, y: 12 },
    { x: 82, y: 20 },
  ];
  return lineup.filter((slot) => Boolean(posMap[slot.pos.toUpperCase()])).map((slot, idx) => {
    const key = slot.pos.toUpperCase();
    const coords = posMap[key] ?? fallback[idx] ?? { x: 50, y: 56 };
    return { name: slot.name, pos: slot.pos, x: coords.x, y: coords.y };
  });
}
