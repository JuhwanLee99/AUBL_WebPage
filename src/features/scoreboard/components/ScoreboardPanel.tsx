import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { TEAMS } from '@shared/lib/mockData';
import { useDemoStore, buildGameRecord } from '@shared/state/demoStore';
import MatchSelectorBar from './MatchSelectorBar';
import { GameTimerDisplay } from '@shared/components/GameTimerDisplay';
import { useAdmin } from '@shared/auth/useAdmin';
import ScoreboardPanelDisplay from './ScoreboardPanelDisplay';
export { BoxScoreTable } from './ScoreboardPanelDisplay';

// 타입 정의
type BatterLine = {
  pa: number;
  ab: number;
  hits: number;
  hr: number;
  doubles: number;
  triples: number;
  bb: number;
  hbp: number;
  so: number;
  sac: number;
  rbi: number;
};

type PitcherLine = {
  bf: number;
  outs: number;
  hits: number;
  hr: number;
  bb: number;
  hbp: number;
  so: number;
  pitches: number;
  strikes: number;
  balls: number;
  runs: number;
};

type PlayerNameParts = { raw: string; base: string; number?: string };

// [수정됨] ScorekeeperPage와 동일한 로직의 헬퍼 함수 추가 (또는 shared/utils로 분리 권장)
const getUniqueName = (name: string, number: string | number | undefined | null) => {
  if (!name) return '';
  return number ? `${name}(${number})` : name;
};

function parsePlayerName(raw: string | null | undefined): PlayerNameParts {
  const trimmed = (raw ?? '').trim();
  const match = trimmed.match(/^(.*?)(?:\(([^)]*)\))?\s*$/);
  const base = (match?.[1] ?? '').trim();
  const number = (match?.[2] ?? '').trim();
  return { raw: trimmed, base, number: number || undefined };
}

function isSamePlayerName(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = parsePlayerName(a);
  const pb = parsePlayerName(b);
  if (!pa.base || !pb.base) return (pa.raw || '') === (pb.raw || '');
  if (pa.base !== pb.base) return false;
  if (pa.number && pb.number) return pa.number === pb.number;
  return true;
}

function classifyResult(result: string) {
  const normalized = result.replace(/\s+/g, '');
  if (normalized.includes('홈런')) return 'hr' as const;
  if (normalized.includes('3루타')) return 'triple' as const;
  if (normalized.includes('2루타')) return 'double' as const;
  if (normalized.includes('1루타')) return 'single' as const;
  if (normalized.includes('고의') || normalized.toUpperCase().includes('IB')) return 'bb' as const;
  if (normalized.includes('볼넷')) return 'bb' as const;
  if (normalized.includes('몸에맞는공')) return 'hbp' as const;
  if (normalized.includes('타격방해')) return 'ci' as const;
  if (normalized.includes('야수선택') || normalized.toUpperCase().includes('F.C')) return 'fc' as const;
  if (normalized.includes('희생플라이')) return 'sac' as const;
  if (normalized.includes('희생번트')) return 'sac' as const;
  if (normalized.includes('낫아웃')) return 'so_reach' as const;
  if (normalized.includes('삼진')) return 'so' as const;
  if (normalized.includes('아웃') && !normalized.includes('도루')) return 'out' as const;
  return null;
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

function extractRuns(result: string): number {
  const match = result.match(/(\d+)\s*득점/);
  if (match) {
    const n = Number(match[1]);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (result.includes('득점')) return 1;
  return 0;
}

function computeBatterLine(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  side: 'home' | 'away',
  batter: string,
): BatterLine {
  const base: BatterLine = { pa: 0, ab: 0, hits: 0, hr: 0, doubles: 0, triples: 0, bb: 0, hbp: 0, so: 0, sac: 0, rbi: 0 };
  if (!batter) return base;
  feed.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    if (offenseSide !== side) return;

    if (!isSamePlayerName(entry.batter, batter)) return;

    const kind = classifyResult(entry.result);
    if (!kind) return;
    if (['single', 'double', 'triple', 'hr', 'bb', 'hbp', 'so', 'so_reach', 'out', 'sac'].includes(kind)) {
      base.pa += 1;
    }
    // 타점 계산
    const runs = extractRuns(entry.result);
    if (runs > 0) base.rbi += runs;

    switch (kind) {
      case 'single':
        base.ab += 1;
        base.hits += 1;
        break;
      case 'double':
        base.ab += 1;
        base.hits += 1;
        base.doubles += 1;
        break;
      case 'triple':
        base.ab += 1;
        base.hits += 1;
        base.triples += 1;
        break;
      case 'hr':
        base.ab += 1;
        base.hits += 1;
        base.hr += 1;
        break;
      case 'bb':
        base.bb += 1;
        break;
      case 'hbp':
        base.hbp += 1;
        break;
      case 'so':
        base.ab += 1;
        base.so += 1;
        break;
      case 'so_reach':
        base.ab += 1;
        base.so += 1;
        break;
      case 'out':
        base.ab += 1;
        break;
      case 'sac':
        base.sac += 1;
        break;
      default:
        break;
    }
  });
  return base;
}

function computePitcherLine(
  feed: ReturnType<typeof useDemoStore>['state']['feed'],
  pitcher: string,
): PitcherLine {
  const base: PitcherLine = { bf: 0, outs: 0, hits: 0, hr: 0, bb: 0, hbp: 0, so: 0, pitches: 0, strikes: 0, balls: 0, runs: 0 };
  if (!pitcher) return base;

  const chronological = [...feed].reverse();
  const current: Record<'home' | 'away', string | null> = { home: null, away: null };
  const cleanName = (raw: string) => raw.replace(/투수/g, '').replace(/·/g, '').trim();
  const isPitcherLog = (result: string) => result.includes('투수 (') || /투수\s*$/.test(result);

  chronological.forEach((entry) => {
    const offenseSide: 'home' | 'away' = entry.half === 'top' ? 'away' : 'home';
    const defenseSide: 'home' | 'away' = offenseSide === 'home' ? 'away' : 'home';
    const result = entry.result.trim();

    if (result.includes('투수 교체')) {
      const incoming = result.split('→')[1];
      if (incoming) current[defenseSide] = cleanName(incoming);
    } else if (isPitcherLog(result)) {
      const namePart = result.includes('투수 (') ? result.split('투수')[0] : result.replace(/투수\s*$/, '');
      current[defenseSide] = cleanName(namePart);
    }

    const activePitcher = current[defenseSide] || pitcher;
    if (!isSamePlayerName(activePitcher, pitcher)) return;

    const pitchInfo = classifyPitch(result);
    if (pitchInfo.pitch) {
      base.pitches += 1;
      if (pitchInfo.strike) base.strikes += 1;
      if (pitchInfo.ball) base.balls += 1;
    }

    // 실점 계산
    const runs = extractRuns(result);
    if (runs > 0) base.runs += runs;

    const kind = classifyResult(result);
    if (!kind) return;
    if (['single', 'double', 'triple', 'hr', 'bb', 'hbp', 'so', 'out', 'sac'].includes(kind)) {
      base.bf += 1;
    }
    switch (kind) {
      case 'single':
        base.hits += 1;
        break;
      case 'double':
        base.hits += 1;
        break;
      case 'triple':
        base.hits += 1;
        break;
      case 'hr':
        base.hits += 1;
        base.hr += 1;
        break;
      case 'bb':
        base.bb += 1;
        break;
      case 'hbp':
        base.hbp += 1;
        break;
      case 'so':
        base.so += 1;
        base.outs += 1;
        break;
      case 'out':
        base.outs += 1;
        break;
      case 'sac':
        base.outs += 1;
        break;
      default:
        break;
    }
  });
  return base;
}


type ScoreboardPanelProps = {
  style?: CSSProperties;
  showFootnote?: boolean;
  showViewerBadge?: boolean;
  hideBases?: boolean;
};

export default function ScoreboardPanel({
  style,
  showFootnote = true,
  showViewerBadge = false,
  hideBases = false,
}: ScoreboardPanelProps) {
  const { state } = useDemoStore();
  const { isAdmin } = useAdmin();
  const homeTeam = useMemo(() => TEAMS.find((t) => t.id === state.homeTeamId), [state.homeTeamId]);
  const awayTeam = useMemo(() => TEAMS.find((t) => t.id === state.awayTeamId), [state.awayTeamId]);
  const activeMatch = useMemo(
    () => state.matches.find((match) => match.id === state.activeMatchId),
    [state.matches, state.activeMatchId],
  );
  const isManualInputMode = (activeMatch?.scoreInputMode ?? 'live') === 'manual';
  const effectivePostGame = activeMatch?.postGame ?? (isManualInputMode ? activeMatch?.manualEntryDraft : undefined);
  const lineupVisible = isAdmin || state.gameStarted || Boolean(activeMatch?.lineupPublic);
  const hittingSide = state.half === 'top' ? 'away' : 'home';
  const defenseSide = hittingSide === 'home' ? 'away' : 'home';
  const offenseLineup = useMemo(
    () => (lineupVisible ? state.lineups[hittingSide].filter((slot) => slot.pos.toUpperCase() !== 'P') : []),
    [hittingSide, state.lineups, lineupVisible],
  );
  const activeOffense = offenseLineup.length ? offenseLineup : lineupVisible ? state.lineups[hittingSide] : [];
  // [수정됨] 현재 타자 이름 가져오기: 이름 + 등번호 조합 사용
  const currentBatterSlot = activeOffense[state.batterIndex[hittingSide] % Math.max(activeOffense.length, 1)];
  const currentBatter = lineupVisible
    ? currentBatterSlot
      ? getUniqueName(currentBatterSlot.name, currentBatterSlot.number)
      : '타자'
    : '라인업 공개 전';

  // [수정됨] 현재 투수 이름 가져오기: 이름 + 등번호 조합 사용
  const currentPitcherSlot = lineupVisible ? state.lineups[defenseSide].find((slot) => slot.pos.toUpperCase() === 'P') : null;
  const currentPitcher = lineupVisible
    ? currentPitcherSlot
      ? getUniqueName(currentPitcherSlot.name, currentPitcherSlot.number)
      : '투수'
    : '라인업 공개 전';

  const inningHalf = state.half === 'top' ? '▲' : '▼';
  const inning = state.inning;
  const ball = state.balls;
  const strike = state.strikes;
  const out = state.outs;
  const bases = state.bases;
  const pitchCount = state.pitchCount ?? 0;

  // 타자/투수 오늘 기록 계산
  const feed = useMemo(() => state.feed, [state.feed]);
  const batterToday = useMemo(
    () => computeBatterLine(feed, hittingSide, currentBatter),
    [feed, hittingSide, currentBatter],
  );
  const pitcherToday = useMemo(() => computePitcherLine(feed, currentPitcher), [feed, currentPitcher]);
  const boxScore = useMemo(() => {
    const record = buildGameRecord(state);

    const { lineScore: liveLine, hits: liveHits, errors: liveErrors } = record.liveStats;
    const maxInning = Math.max(
      state.inning,
      liveLine.home.length,
      liveLine.away.length,
      effectivePostGame?.lineScore?.home?.length ?? 0,
      effectivePostGame?.lineScore?.away?.length ?? 0,
    );
    const inningsHeader = Array.from({ length: Math.max(9, maxInning) }, (_, i) => i + 1);

    const padInnings = (arr: number[]) =>
      inningsHeader.map((_, idx) => (arr[idx] != null ? arr[idx] : '—'));

    const totals = effectivePostGame?.totals ?? {
      home: { runs: state.score.home, hits: liveHits.home, errors: liveErrors.home },
      away: { runs: state.score.away, hits: liveHits.away, errors: liveErrors.away },
    };

    const postGameLineScore = effectivePostGame?.lineScore;
    const hasPostGameLineScoreInnings = Array.isArray(postGameLineScore?.innings) && postGameLineScore.innings.length > 0;
    const lineScore = hasPostGameLineScoreInnings
      ? postGameLineScore
      : {
          innings: inningsHeader,
          home: liveLine.home,
          away: liveLine.away,
        };
    const baseInnings = Array.from({ length: 9 }, (_v, idx) => idx + 1);
    const hasExtras = (lineScore?.innings?.length ?? 0) > 9;
    const innings = hasExtras ? [...baseInnings, '10+'] : baseInnings;
    const mk = (side: 'home' | 'away') => ({
      name: state.teamNames[side] || (side === 'home' ? homeTeam?.name : awayTeam?.name) || side.toUpperCase(),
      runs: totals?.[side]?.runs ?? state.score[side],
      hits: totals?.[side]?.hits ?? '—',
      errors: totals?.[side]?.errors ?? '—',
      innings: padInnings(lineScore?.[side]),
      color: side === 'home' ? '#f97316' : '#60a5fa',
    });
    return { innings, rows: [mk('away'), mk('home')] };
  }, [state, homeTeam, awayTeam, effectivePostGame]);

  const displayScore = useMemo(
    () => ({
      home: effectivePostGame?.totals?.home?.runs ?? state.score.home,
      away: effectivePostGame?.totals?.away?.runs ?? state.score.away,
    }),
    [effectivePostGame, state.score.home, state.score.away],
  );
  const summaryTime = useMemo(() => {
    if (!activeMatch?.startTime) return '일시 미정';
    const date = new Date(activeMatch.startTime);
    if (Number.isNaN(date.getTime())) return '일시 미정';
    return date.toLocaleString('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [activeMatch]);
  const summaryVenue = activeMatch?.venue || '경기장 미정';

  return <ScoreboardPanelDisplay
    style={style} showFootnote={showFootnote} hideBases={hideBases}
    teamNames={{ home: state.teamNames.home || homeTeam?.name || 'HOME', away: state.teamNames.away || awayTeam?.name || 'AWAY' }}
    displayScore={displayScore} currentPitcher={currentPitcher} currentBatter={currentBatter}
    pitcherDescription={`${pitchCount}구 (S:${pitcherToday.strikes} / B:${pitcherToday.balls}) · ${pitcherToday.runs}실점`}
    batterDescription={`${batterToday.ab}타수 ${batterToday.hits}안타 ${batterToday.rbi}타점`}
    inningLabel={<>{inningHalf}{inning}</>} ball={ball} strike={strike} out={out} bases={bases}
    lastPlay={state.lastPlay} boxScore={boxScore}
    header={<>
      <MatchSelectorBar summaryTime={summaryTime} summaryVenue={summaryVenue} showViewerBadge={showViewerBadge} viewerCount={state.onlineViewerCount} />
      <GameTimerDisplay gameLimitMinutes={state.gameLimitMinutes} gameStartTimestamp={state.gameStartTimestamp}
        gamePausedAt={state.gamePausedAt} gamePausedDuration={state.gamePausedDuration} gameStarted={state.gameStarted}
        style={{ padding: '6px 14px' }} />
    </>}
  />;
}
