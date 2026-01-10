import { useEffect, useMemo, useState } from 'react';
import { TEAMS } from '../../shared/lib/mockData';
import { buildGameRecord, useDemoStore } from '../../shared/state/demoStore';

type Side = 'home' | 'away';

const mainButtons = [
  { label: '볼', color: '#22c55e', action: 'ball' },
  { label: '스트라이크', color: '#22c55e', action: 'strike' },
  { label: '파울', color: '#facc15', action: 'foul' },
  { label: '타격', color: '#3b82f6', action: 'hitMenu' },
  { label: '삼진', color: '#ef4444', action: 'strikeOut' },
  { label: '실행 취소', color: '#94a3b8', action: 'undo' },
];

const hitButtons = [
  { label: '1루타', color: '#3b82f6', action: 'single' },
  { label: '2루타', color: '#3b82f6', action: 'double' },
  { label: '3루타', color: '#3b82f6', action: 'triple' },
  { label: '홈런', color: '#f97316', action: 'hr' },
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

type PlayerStat = {
  name: string;
  pos?: string;
  pa: number;
  ab: number;
  h: number;
  singles: number;
  doubles: number;
  triples: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
};

function ensurePlayerStat(name: string, pos?: string): PlayerStat {
  return {
    name,
    pos,
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

type PitcherStat = {
  name: string;
  pos?: string;
  bf: number;
  pitches: number;
  strikes: number;
  balls: number;
  outs: number;
  h: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
};

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
  record.benches.home.forEach((p, idx) => {
    if (!rosterHome.has(p.name)) rosterHome.set(p.name, { pos: p.pos, order: 100 + idx });
  });
  record.benches.away.forEach((p, idx) => {
    if (!rosterAway.has(p.name)) rosterAway.set(p.name, { pos: p.pos, order: 100 + idx });
  });

  const statsHome = new Map<string, PlayerStat>();
  const statsAway = new Map<string, PlayerStat>();
  const pitchHome = new Map<string, PitcherStat>();
  const pitchAway = new Map<string, PitcherStat>();

  const addStat = (side: 'home' | 'away', name: string) => {
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? statsHome : statsAway;
    if (!store.has(name)) {
      store.set(name, ensurePlayerStat(name, pos));
    }
    return store.get(name)!;
  };

  const addPitch = (side: 'home' | 'away', name: string) => {
    const roster = side === 'home' ? rosterHome : rosterAway;
    const pos = roster.get(name)?.pos;
    const store = side === 'home' ? pitchHome : pitchAway;
    if (!store.has(name)) {
      store.set(name, ensurePitcherStat(name, pos));
    }
    return store.get(name)!;
  };

  const pitcherOfSide = (side: 'home' | 'away') => {
    const lineup = side === 'home' ? record.lineups.home : record.lineups.away;
    return lineup.find((p) => p.pos.toUpperCase() === 'P')?.name;
  };

  [...record.feed].reverse().forEach((entry) => {
    const name = entry.batter?.trim();
    if (!name) return;
    const side = rosterHome.has(name) ? 'home' : rosterAway.has(name) ? 'away' : null;
    if (!side) return;
    const defenseSide = side === 'home' ? 'away' : 'home';
    const pitcherName = pitcherOfSide(defenseSide);
    let pitcherStat: PitcherStat | null = null;
    if (pitcherName) {
      pitcherStat = addPitch(defenseSide, pitcherName);
    }
    const pitchInfo = classifyPitch(entry.result);
    if (pitcherStat && pitchInfo.pitch) {
      pitcherStat.pitches += 1;
      if (pitchInfo.strike) pitcherStat.strikes += 1;
      if (pitchInfo.ball) pitcherStat.balls += 1;
    }
    const kind = classifyResult(entry.result);
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

  const toArray = (roster: Map<string, { pos?: string; order: number }>, store: Map<string, PlayerStat>) => {
    const names = [...roster.entries()].sort((a, b) => a[1].order - b[1].order).map(([name]) => name);
    const fromRoster = names
      .map((name) => {
        const meta = roster.get(name);
        const isPitcher = (meta?.pos ?? '').toUpperCase() === 'P';
        const stat = store.get(name);
        // 지명타자 경기에서는 투수를 기본 타자 목록에서 제외하고, 타석 기록이 있는 경우에만 표시
        if (isPitcher && !stat) return null;
        const base = ensurePlayerStat(name, meta?.pos);
        return stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base;
      })
      .filter(Boolean) as PlayerStat[];
    const extra = [...store.values()].filter((s) => !roster.has(s.name));
    return [...fromRoster, ...extra];
  };

  const toPitcherArray = (roster: Map<string, { pos?: string; order: number }>, store: Map<string, PitcherStat>) => {
    const names = [...roster.entries()]
      .filter(([, meta]) => (meta.pos ?? '').toUpperCase() === 'P')
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name]) => name);
    const baseList = names.map((name) => {
      const base = ensurePitcherStat(name, roster.get(name)?.pos);
      const stat = store.get(name);
      return stat ? { ...base, ...stat, pos: stat.pos ?? base.pos } : base;
    });
    const extra = [...store.values()].filter((s) => !roster.has(s.name));
    return [...baseList, ...extra];
  };

  return {
    hitters: {
      home: toArray(rosterHome, statsHome),
      away: toArray(rosterAway, statsAway),
    },
    pitchers: {
      home: toPitcherArray(rosterHome, pitchHome),
      away: toPitcherArray(rosterAway, pitchAway),
    },
  };
}

export default function ScorekeeperPage() {
  const { state, actions } = useDemoStore();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);
  const hittingSide: Side = state.half === 'top' ? 'away' : 'home';
  const defenseSide: Side = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineup = state.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P');
  const activeOffenseLineup = offenseLineup.length ? offenseLineup : state.lineups[hittingSide];
  const defenseLineup = state.lineups[defenseSide];
  const currentBatter =
    activeOffenseLineup[state.batterIndex[hittingSide] % (activeOffenseLineup.length || 1)]?.name ?? '타자';
  const currentPitcher = defenseLineup.find((slot) => slot.pos.toUpperCase() === 'P')?.name ?? '';
  const [actionModal, setActionModal] = useState<
    | { role: 'runner'; name: string; base: 0 | 1 | 2 }
    | { role: 'batter'; name: string }
    | { role: 'fielder'; name: string; pos: string }
    | null
  >(null);
  const [benchInput, setBenchInput] = useState<{ [K in Side]: { name: string; pos: string; number: string; throws: string; bats: string } }>({
    home: { name: '', pos: '', number: '', throws: 'R', bats: 'R' },
    away: { name: '', pos: '', number: '', throws: 'R', bats: 'R' },
  });
  const [showHitOptions, setShowHitOptions] = useState(false);
  const [showOutOptions, setShowOutOptions] = useState(false);
  const recordPayload = useMemo(() => buildGameRecord(state), [state]);
  const [pendingExportId, setPendingExportId] = useState<string | null>(null);
  const isGameOver = state.gameOver;
  const isExporting = Boolean(pendingExportId);
  const canUndo = state.history.length > 0;
  const playerStats = useMemo(() => buildPlayerStats(recordPayload), [recordPayload]);

  useEffect(() => {
    if (state.gameOver) {
      setShowHitOptions(false);
      setShowOutOptions(false);
    }
  }, [state.gameOver]);

  useEffect(() => {
    if (!pendingExportId) return;
    if (state.gameOver && state.endedAt === pendingExportId) {
      const filename = buildDownloadName('scorecard', state.endedAt);
      const csv = buildCsvRecord(recordPayload);
      downloadCsv(csv, filename);
      setPendingExportId(null);
    }
  }, [pendingExportId, recordPayload, state.endedAt, state.gameOver]);

  const handleAction = (action: string) => {
    if (isGameOver) return;
    if (action === 'hitMenu') {
      setShowHitOptions((prev) => !prev);
      setShowOutOptions(false);
      return;
    }
    if (action === 'outMenu') {
      setShowOutOptions((prev) => !prev);
      setShowHitOptions(false);
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
        actions.hitSingle();
        break;
      case 'double':
        actions.hitDouble();
        break;
      case 'triple':
        actions.hitTriple();
        break;
      case 'hr':
        actions.homeRun();
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
        actions.addOutWithMessage('땅볼 아웃');
        break;
      case 'out_fly':
        actions.addOutWithMessage('뜬공 아웃');
        break;
      case 'out_line':
        actions.addOutWithMessage('라인드라이브 아웃');
        break;
      case 'out_dp2':
        actions.doublePlay();
        break;
      case 'out_tp3':
        actions.triplePlay();
        break;
      case 'out_infield_fly':
        actions.addOutWithMessage('내야 플라이 아웃');
        break;
      case 'out_outfield_fly':
        actions.addOutWithMessage('외야 플라이 아웃');
        break;
      case 'out_other':
        actions.addOutWithMessage('기타 아웃');
        break;
      case 'sac':
        actions.sacFly();
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

    setShowHitOptions(false);
    setShowOutOptions(false);
  };

  const handleEndGame = () => {
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
    setShowHitOptions(false);
    setActionModal(null);
    actions.resetGame();
  };

  return (
    <div
      style={{
        borderRadius: '20px',
        overflow: 'hidden',
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
            onSelectRunner={(payload) => setActionModal({ role: 'runner', ...payload })}
            onSelectBatter={() => setActionModal({ role: 'batter', name: currentBatter })}
            onSelectFielder={(payload) => setActionModal({ role: 'fielder', ...payload })}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#cbd5e1' }}>
              <span style={{ fontWeight: 900 }}>Command Center</span>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 800,
                  color: isGameOver ? '#fca5a5' : '#67e8f9',
                  background: isGameOver ? 'rgba(248,113,113,0.12)' : 'rgba(56,189,248,0.12)',
                  border: `1px solid ${isGameOver ? 'rgba(248,113,113,0.4)' : 'rgba(56,189,248,0.35)'}`,
                  borderRadius: '999px',
                  padding: '6px 10px',
                }}
              >
                {isGameOver ? '경기 종료됨 · 기록 잠금' : '실시간 입력 가능'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
              {mainButtons.map((btn) => {
                const isUndo = btn.action === 'undo';
                const isHitMenu = btn.action === 'hitMenu';
                const isActive = isHitMenu && showHitOptions;
                const isDisabled = isGameOver || (isUndo && !canUndo);
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
            {showHitOptions ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                {hitButtons.map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    disabled={isGameOver}
                    style={{
                      padding: '12px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(15,23,42,0.4)',
                      background: 'rgba(255,255,255,0.08)',
                      color: btn.color,
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: isGameOver ? 'not-allowed' : 'pointer',
                      opacity: isGameOver ? 0.6 : 1,
                    }}
                    onClick={() => handleAction(btn.action)}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            ) : null}
            {showOutOptions ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                {outButtons.map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    disabled={isGameOver}
                    style={{
                      padding: '10px 10px',
                      borderRadius: '10px',
                      border: '1px solid rgba(15,23,42,0.4)',
                      background: 'rgba(255,255,255,0.08)',
                      color: '#fca5a5',
                      fontWeight: 800,
                      fontSize: '13px',
                      cursor: isGameOver ? 'not-allowed' : 'pointer',
                      opacity: isGameOver ? 0.6 : 1,
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
                  disabled={isGameOver}
                  style={{
                    padding: '10px 10px',
                    borderRadius: '10px',
                    border: '1px solid rgba(15,23,42,0.4)',
                    background: 'rgba(255,255,255,0.06)',
                    color: btn.color,
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: isGameOver ? 'not-allowed' : 'pointer',
                    opacity: isGameOver ? 0.6 : 1,
                  }}
                  onClick={() => handleAction(btn.action)}
                >
                  {btn.label}
                </button>
              ))}
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
          <StatsTable title={`${state.teamNames.home} 타자 기록`} stats={playerStats.hitters.home} variant="batter" />
          <StatsTable title={`${state.teamNames.home} 투수 기록`} stats={playerStats.pitchers.home} variant="pitcher" />
        </div>
        <div style={{ display: 'grid', gap: '10px' }}>
          <StatsTable title={`${state.teamNames.away} 타자 기록`} stats={playerStats.hitters.away} variant="batter" />
          <StatsTable title={`${state.teamNames.away} 투수 기록`} stats={playerStats.pitchers.away} variant="pitcher" />
        </div>
      </div>

      {actionModal && (
        <ActionModal
          data={actionModal}
          onClose={() => setActionModal(null)}
          actions={actions}
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

function ActionModal({
  data,
  onClose,
  actions,
}: {
  data: { role: 'runner'; name: string; base: 0 | 1 | 2 } | { role: 'batter'; name: string } | { role: 'fielder'; name: string; pos: string };
  onClose: () => void;
  actions: ReturnType<typeof useDemoStore>['actions'];
}) {
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
    if (data.role === 'batter') {
      return (
        <>
          <RunnerActionButton label="1루타" color="#3b82f6" onClick={() => actions.hitSingle()} />
          <RunnerActionButton label="2루타" color="#3b82f6" onClick={() => actions.hitDouble()} />
          <RunnerActionButton label="3루타" color="#3b82f6" onClick={() => actions.hitTriple()} />
          <RunnerActionButton label="홈런" color="#f97316" onClick={() => actions.homeRun()} />
          <RunnerActionButton label="볼넷" color="#22c55e" onClick={() => actions.walk()} />
          <RunnerActionButton label="사구" color="#22c55e" onClick={() => actions.hbp()} />
          <RunnerActionButton label="아웃" color="#ef4444" onClick={() => actions.addOut()} />
        </>
      );
    }
    return (
      <>
        <RunnerActionButton label="실책 기록" color="#f97316" onClick={() => actions.setPlay(`실책 · ${data.pos} ${data.name}`)} />
        <RunnerActionButton label="포구 완료" color="#22c55e" onClick={() => actions.setPlay(`포구 · ${data.pos} ${data.name}`)} />
        <RunnerActionButton label="중계 플레이" color="#38bdf8" onClick={() => actions.setPlay(`중계 · ${data.pos} ${data.name}`)} />
      </>
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
        <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>{renderButtons()}</div>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
          이벤트 확정 시 DB 저장 훅으로 연결해 텍스트 기록과 동일하게 남길 수 있습니다.
        </p>
      </div>
    </div>
  );
}

function labelForModal(data: { role: 'runner'; name: string; base: 0 | 1 | 2 } | { role: 'batter'; name: string } | { role: 'fielder'; name: string; pos: string }) {
  if (data.role === 'runner') return `주자 액션 · ${data.name}`;
  if (data.role === 'batter') return `타석 액션 · ${data.name}`;
  return `수비 액션 · ${data.pos} ${data.name}`;
}

function subLabelForModal(data: { role: 'runner'; name: string; base: 0 | 1 | 2 } | { role: 'batter'; name: string } | { role: 'fielder'; name: string; pos: string }) {
  if (data.role === 'runner') return `${data.base + 1}루 주자`;
  if (data.role === 'batter') return '현재 타자';
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
            key={entry.slot.name + entry.idx}
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
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {battingEntries.map((entry, orderIdx) => (
                  <button
                    key={entry.slot.name + entry.idx}
                    type="button"
                    onClick={() => onSubstitute(side, benchIdx, entry.idx)}
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
                    {orderIdx + 1}번
                  </button>
                ))}
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatsTable({
  title,
  stats,
  variant,
}: {
  title: string;
  stats: PlayerStat[] | PitcherStat[];
  variant: 'batter' | 'pitcher';
}) {
  const isBatter = variant === 'batter';
  const columns = isBatter
    ? [
        { key: 'name', label: '선수', width: '90px' },
        { key: 'pa', label: '타석' },
        { key: 'ab', label: '타수' },
        { key: 'h', label: '안타' },
        { key: 'singles', label: '1루타' },
        { key: 'doubles', label: '2루타' },
        { key: 'triples', label: '3루타' },
        { key: 'hr', label: '홈런' },
        { key: 'bb', label: '볼넷' },
        { key: 'hbp', label: '사구' },
        { key: 'so', label: '삼진' },
        { key: 'sac', label: '희생플라이' },
        { key: 'avg', label: '타율' },
        { key: 'obp', label: '출루율' },
      ]
    : [
        { key: 'name', label: '선수', width: '90px' },
        { key: 'bf', label: '타자상대' },
        { key: 'pitchCombo', label: '투구수(S/B)' },
        { key: 'outs', label: '이닝' },
        { key: 'h', label: '피안타' },
        { key: 'hr', label: '피홈런' },
        { key: 'bb', label: '볼넷' },
        { key: 'hbp', label: '사구' },
        { key: 'so', label: '탈삼진' },
      ];

  const rows = isBatter
    ? (stats as PlayerStat[]).map((stat) => {
        const avg = stat.ab > 0 ? stat.h / stat.ab : 0;
        const obpDen = stat.ab + stat.bb + stat.hbp + stat.sac;
        const obp = obpDen > 0 ? (stat.h + stat.bb + stat.hbp) / obpDen : 0;
        const fmt = (val: number) => (Number.isFinite(val) ? val.toFixed(3).replace(/^0/, '') : '-');
        return { ...stat, avg: stat.ab > 0 ? fmt(avg) : '-', obp: obpDen > 0 ? fmt(obp) : '-' };
      })
    : (stats as PitcherStat[]).map((stat) => {
        const ip = `${Math.floor(stat.outs / 3)}.${stat.outs % 3}`;
        return { ...stat, outsIp: ip, pitchCombo: `${stat.pitches} (${stat.strikes}/${stat.balls})` };
      });

  return (
    <div
      style={{
        background: '#0b0f1a',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '14px',
        padding: '12px',
        display: 'grid',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 900, color: '#e2e8f0' }}>{title}</span>
        <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '12px' }}>실시간 자동 집계 (타석 기준)</span>
      </div>
      <div
        style={{
          overflowX: 'auto',
          borderRadius: '10px',
          border: '1px solid rgba(148, 163, 184, 0.15)',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            color: '#e2e8f0',
            fontSize: '12px',
            minWidth: isBatter ? '560px' : '540px',
          }}
        >
          <thead style={{ background: 'rgba(255,255,255,0.04)' }}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    textAlign: col.key === 'name' ? 'left' : 'center',
                    padding: '6px 4px',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
                    minWidth: col.width ?? '50px',
                    fontWeight: 800,
                    color: '#cbd5e1',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.name + idx}
                style={{
                  background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.5)' : 'rgba(15, 23, 42, 0.3)',
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{
                      padding: '6px 4px',
                      textAlign: col.key === 'name' ? 'left' : 'center',
                      borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                      fontWeight: col.key === 'name' ? 800 : 700,
                      color: col.key === 'name' ? '#e2e8f0' : '#cbd5e1',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.key === 'name' ? (
                      <span>
                        {row.name}
                        {row.pos ? (
                          <span style={{ color: '#94a3b8', marginLeft: '4px', fontWeight: 700 }}>({row.pos.toUpperCase()})</span>
                        ) : null}
                      </span>
                    ) : (
                      (() => {
                        const value =
                          col.key === 'outs' && !isBatter
                            ? (row as PitcherStat & { outsIp?: string }).outsIp ?? (row as PitcherStat).outs
                            : (row as Record<string, string | number | undefined>)[col.key];
                        return value ?? '-';
                      })()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
